create table public.storage_nodes (
  id uuid not null default gen_random_uuid (),
  parent_id uuid null,
  name text not null,
  type text not null,
  r2_key text null,
  size bigint null default 0,
  mime_type text null,
  created_by uuid null,
  owner_email text null,
  sharing_scope text null default 'PRIVATE'::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  project_id uuid null,
  share_password text null,
  share_expiry timestamp with time zone null,
  constraint storage_nodes_pkey primary key (id),
  constraint storage_nodes_created_by_fkey foreign KEY (created_by) references auth.users (id),
  constraint storage_nodes_parent_id_fkey foreign KEY (parent_id) references storage_nodes (id) on delete CASCADE,
  constraint storage_nodes_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE,
  constraint storage_nodes_type_check check (
    (type = any (array['FILE'::text, 'FOLDER'::text]))
  )
) TABLESPACE pg_default;

create index IF not exists idx_parent_id on public.storage_nodes using btree (parent_id) TABLESPACE pg_default;