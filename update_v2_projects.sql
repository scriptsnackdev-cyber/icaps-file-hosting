-- 1. Update Whitelist to support Roles
ALTER TABLE whitelist ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 2. Create Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  max_storage_bytes bigint DEFAULT 107374182400, -- 100 GB default
  current_storage_bytes bigint DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- 3. Create Project Members Table
CREATE TABLE IF NOT EXISTS project_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_email text REFERENCES whitelist(email) ON DELETE CASCADE,
  added_at timestamp with time zone DEFAULT now(),
  UNIQUE(project_id, user_email)
);

-- 4. Linking Storage Nodes to Projects
-- We need to associate every folder/file with a project
ALTER TABLE storage_nodes ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- Optional: Create a function to auto-update project storage usage
-- (For now, we will handle calculation in the API for simplicity)

-- 5. RLS Policies (Examples - You may need to enable RLS on the table first)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Admins: Have full access
-- Users: Can see projects they are members of

-- Note: 'auth.email()' needs to be available or you might need to join with auth.users if using UUID
-- For simplicity in this script, we assume application-level checks or standard Supabase auth policies.

-- 6. Fix for Multi-Project Membership
-- Ensure we don't have a unique constraint on user_email alone (which prevents user from joining multiple projects)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_user_email_key') THEN
        ALTER TABLE project_members DROP CONSTRAINT project_members_user_email_key;
    END IF;
END $$;

