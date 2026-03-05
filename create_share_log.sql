-- ============================================================
-- Activity Log for ICAPS File Hosting
-- Table: share_log
-- ============================================================

-- 1. Create the log table
create table if not exists share_log (
    id           uuid        primary key default gen_random_uuid(),
    project_id   uuid        references share_projects(id) on delete cascade,
    user_email   text        not null,
    action       text        not null,   -- See ACTION TYPES below
    node_id      uuid,                   -- nullable (node may be deleted)
    node_name    text        not null,   -- snapshot of name at log time
    metadata     jsonb,                  -- extra context (old_name, new_name, size, etc.)
    created_at   timestamptz not null default now()
);

-- 2. Index for fast per-project queries (latest first)
create index if not exists share_log_project_created_idx
    on share_log (project_id, created_at desc);

-- 3. RLS
alter table share_log enable row level security;

-- Project admins and global admins can read logs for their project
create policy "Project admins can read logs"
    on share_log for select
    using (
        -- global admin
        exists (
            select 1 from share_whitelist
            where email = auth.email() and role = 'admin'
        )
        or
        -- project admin
        exists (
            select 1 from share_project_members
            where project_id = share_log.project_id
              and email = auth.email()
              and role = 'admin'
        )
    );

-- Any authenticated user can insert their own logs
create policy "Authenticated users can insert logs"
    on share_log for insert
    with check (auth.role() = 'authenticated');

-- ============================================================
-- ACTION TYPES (for reference):
--   upload          - file uploaded
--   folder_create   - folder created
--   download        - internal download
--   delete          - node deleted
--   rename          - node renamed (metadata: {old_name, new_name})
--   move            - node moved (metadata: {destination_name})
--   share_create    - share link created
--   share_download  - external download via share link (user_email = share link id)
-- ============================================================
