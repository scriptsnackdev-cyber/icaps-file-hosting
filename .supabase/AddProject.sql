-- ==========================================
-- 1. ENUMS AND TABLES
-- ==========================================

-- Create enum for project member roles
CREATE TYPE public.share_project_role AS ENUM ('admin', 'member', 'read_only');

-- Create projects table
CREATE TABLE IF NOT EXISTS public.share_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Trigger for projects updated_at
CREATE TRIGGER update_share_projects_modtime
BEFORE UPDATE ON public.share_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_share_modified_column();

-- Create project members junction table
CREATE TABLE IF NOT EXISTS public.share_project_members (
    project_id UUID REFERENCES public.share_projects(id) ON DELETE CASCADE,
    email TEXT REFERENCES public.share_whitelist(email) ON DELETE CASCADE,
    role public.share_project_role DEFAULT 'read_only',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (project_id, email)
);

-- ==========================================
-- 2. UPDATE share_nodes
-- ==========================================

-- Add project_id to share_nodes (nullable initially to allow existing data, but should be required later)
ALTER TABLE public.share_nodes ADD COLUMN project_id UUID REFERENCES public.share_projects(id) ON DELETE CASCADE;

-- Create index for faster querying by project
CREATE INDEX IF NOT EXISTS idx_share_nodes_project_id ON public.share_nodes(project_id);

-- ---------------------------------------------------------------------------------------------------------
-- MANUAL MIGRATION STEP FOR EXISTING DATA (If you have files existing in your current drive)
-- You MUST create a "Default Project" and assign all existing files to it before enforcing project_id
-- ---------------------------------------------------------------------------------------------------------
-- INSERT INTO public.share_projects (id, name, description) VALUES ('00000000-0000-0000-0000-000000000000', 'Global Drive', 'Default migrated project');
-- UPDATE public.share_nodes SET project_id = '00000000-0000-0000-0000-000000000000' WHERE project_id IS NULL;
-- ALTER TABLE public.share_nodes ALTER COLUMN project_id SET NOT NULL;


-- ==========================================
-- 3. ROW LEVEL SECURITY (RLS) UPDATES
-- ==========================================

-- Enable RLS
ALTER TABLE public.share_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_project_members ENABLE ROW LEVEL SECURITY;

-- Helper Function to check if current user is Global Admin
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role FROM public.share_whitelist WHERE email = auth.jwt()->>'email') = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper Function to check user's role in a specific project
CREATE OR REPLACE FUNCTION public.get_user_project_role(p_project_id UUID)
RETURNS public.share_project_role AS $$
BEGIN
    RETURN (SELECT role FROM public.share_project_members WHERE project_id = p_project_id AND email = auth.jwt()->>'email');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper Function to get all projects a user is a member of (to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_projects()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY SELECT project_id FROM public.share_project_members WHERE email = auth.jwt()->>'email';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-----------------------------------------
-- POLICIES: share_projects
-----------------------------------------
DROP POLICY IF EXISTS "Projects select policy" ON public.share_projects;
DROP POLICY IF EXISTS "Projects insert policy (Global Admin Only)" ON public.share_projects;
DROP POLICY IF EXISTS "Projects update policy (Global Admin Only)" ON public.share_projects;
DROP POLICY IF EXISTS "Projects delete policy (Global Admin Only)" ON public.share_projects;

-- Read: Global Admins can see ALL. Regular users can see projects they are members of.
CREATE POLICY "Projects select policy" ON public.share_projects
    FOR SELECT USING (
        public.is_global_admin() OR 
        id IN (SELECT public.get_user_projects())
    );

-- Insert/Update/Delete: ONLY Global Admins can create or delete projects.
CREATE POLICY "Projects insert policy (Global Admin Only)" ON public.share_projects
    FOR INSERT WITH CHECK (public.is_global_admin());

CREATE POLICY "Projects update policy (Global Admin Only)" ON public.share_projects
    FOR UPDATE USING (public.is_global_admin());

CREATE POLICY "Projects delete policy (Global Admin Only)" ON public.share_projects
    FOR DELETE USING (public.is_global_admin());

-----------------------------------------
-- POLICIES: share_project_members
-----------------------------------------
DROP POLICY IF EXISTS "Project members select policy" ON public.share_project_members;
DROP POLICY IF EXISTS "Project members manage policy" ON public.share_project_members;

-- Read: Global Admins can see all members. Project members can see other members in the same project.
CREATE POLICY "Project members select policy" ON public.share_project_members
    FOR SELECT USING (
        public.is_global_admin() OR 
        project_id IN (SELECT public.get_user_projects())
    );

-- Manage: Global Admins OR Project 'admin' can add/edit/remove members.
CREATE POLICY "Project members manage policy" ON public.share_project_members
    FOR ALL USING (
        public.is_global_admin() OR 
        public.get_user_project_role(project_id) = 'admin'
    );

-----------------------------------------
-- POLICIES: share_nodes (Override existing open policies)
-----------------------------------------
DROP POLICY IF EXISTS "Enable read access for all users" ON public.share_nodes;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.share_nodes;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.share_nodes;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.share_nodes;

DROP POLICY IF EXISTS "Nodes select policy" ON public.share_nodes;
DROP POLICY IF EXISTS "Nodes insert policy" ON public.share_nodes;
DROP POLICY IF EXISTS "Nodes update policy" ON public.share_nodes;
DROP POLICY IF EXISTS "Nodes delete policy" ON public.share_nodes;

-- Read: Global Admins OR Members of the project (any role)
CREATE POLICY "Nodes select policy" ON public.share_nodes
    FOR SELECT USING (
        public.is_global_admin() OR 
        public.get_user_project_role(project_id) IN ('admin', 'member', 'read_only')
    );

-- Insert: Global Admins OR Members of the project (admin/member only, NOT read_only)
CREATE POLICY "Nodes insert policy" ON public.share_nodes
    FOR INSERT WITH CHECK (
        public.is_global_admin() OR 
        public.get_user_project_role(project_id) IN ('admin', 'member')
    );

-- Update: Global Admins OR Members of the project (admin/member only)
CREATE POLICY "Nodes update policy" ON public.share_nodes
    FOR UPDATE USING (
        public.is_global_admin() OR 
        public.get_user_project_role(project_id) IN ('admin', 'member')
    );

-- Delete: Global Admins OR Members of the project (admin/member only)
CREATE POLICY "Nodes delete policy" ON public.share_nodes
    FOR DELETE USING (
        public.is_global_admin() OR 
        public.get_user_project_role(project_id) IN ('admin', 'member')
    );


-- ==========================================
-- 4. UPDATE RPC FUNCTIONS (from RPC.sql)
-- ==========================================
-- We need to update existing RPC functions to filter by project_id

-- 4.1. Get total usage (For a specific project or all if global admin)
CREATE OR REPLACE FUNCTION get_total_usage(p_project_id UUID DEFAULT NULL)
RETURNS bigint AS $$
DECLARE
    total bigint;
BEGIN
    IF p_project_id IS NOT NULL THEN
        SELECT COALESCE(SUM(size), 0) INTO total FROM public.share_nodes WHERE type = 'file' AND project_id = p_project_id;
    ELSE
        SELECT COALESCE(SUM(size), 0) INTO total FROM public.share_nodes WHERE type = 'file';
    END IF;
    RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.2. Get nodes with their calculated sizes (Added project filter)
CREATE OR REPLACE FUNCTION get_nodes_with_sizes(p_project_id UUID, p_parent_id uuid DEFAULT NULL, p_search_query text DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    name text,
    type public.share_node_type,
    parent_id uuid,
    size bigint,
    mime_type text,
    r2_key text,
    created_at timestamptz,
    updated_at timestamptz,
    project_id uuid
) AS $$
BEGIN
    IF p_search_query IS NOT NULL THEN
        RETURN QUERY
        SELECT n.id, n.name, n.type, n.parent_id, 
               CASE WHEN n.type = 'folder' THEN public.get_folder_size(n.id) ELSE n.size END AS size,
               n.mime_type, n.r2_key, n.created_at, n.updated_at, n.project_id
        FROM public.share_nodes n
        WHERE n.project_id = p_project_id 
          AND n.name ILIKE '%' || p_search_query || '%'
        ORDER BY n.type DESC, n.name ASC;
    ELSE
        RETURN QUERY
        SELECT n.id, n.name, n.type, n.parent_id, 
               CASE WHEN n.type = 'folder' THEN public.get_folder_size(n.id) ELSE n.size END AS size,
               n.mime_type, n.r2_key, n.created_at, n.updated_at, n.project_id
        FROM public.share_nodes n
        WHERE n.project_id = p_project_id 
          AND ((p_parent_id IS NULL AND n.parent_id IS NULL) OR (n.parent_id = p_parent_id))
        ORDER BY n.type DESC, n.name ASC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.3. Get recent nodes with their calculated sizes (Added project filter)
CREATE OR REPLACE FUNCTION get_recent_nodes_with_sizes(p_project_id UUID)
RETURNS TABLE (
    id uuid,
    name text,
    type public.share_node_type,
    parent_id uuid,
    size bigint,
    mime_type text,
    r2_key text,
    created_at timestamptz,
    updated_at timestamptz,
    project_id uuid
) AS $$
BEGIN
    RETURN QUERY
    SELECT n.id, n.name, n.type, n.parent_id, 
           CASE WHEN n.type = 'folder' THEN public.get_folder_size(n.id) ELSE n.size END AS size,
           n.mime_type, n.r2_key, n.created_at, n.updated_at, n.project_id
    FROM public.share_nodes n
    WHERE n.project_id = p_project_id
    ORDER BY n.updated_at DESC
    LIMIT 30;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
