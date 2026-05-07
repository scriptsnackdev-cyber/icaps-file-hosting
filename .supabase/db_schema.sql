-- Supabase Schema for icaps-file-hosting

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: public.share_projects
CREATE TABLE IF NOT EXISTS public.share_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID, -- References auth.users(id)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: public.share_project_members
CREATE TABLE IF NOT EXISTS public.share_project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.share_projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'read_only', -- admin, member, read_only
    created_by UUID, -- References auth.users(id)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, email)
);

-- Table: public.share_nodes
CREATE TABLE IF NOT EXISTS public.share_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'folder', 'file'
    parent_id UUID REFERENCES public.share_nodes(id) ON DELETE CASCADE,
    size BIGINT,
    mime_type TEXT,
    r2_key TEXT,
    project_id UUID REFERENCES public.share_projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an index to quickly load a folder's contents
CREATE INDEX IF NOT EXISTS idx_share_nodes_parent_id ON public.share_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_share_nodes_project_id ON public.share_nodes(project_id);

-- Table: public.share_links
CREATE TABLE IF NOT EXISTS public.share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID REFERENCES public.share_nodes(id) ON DELETE CASCADE,
    password_hash TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: public.share_whitelist
CREATE TABLE IF NOT EXISTS public.share_whitelist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- admin, member
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: public.share_log
CREATE TABLE IF NOT EXISTS public.share_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.share_projects(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    node_id UUID,
    node_name TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helper Functions
CREATE OR REPLACE FUNCTION update_share_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_share_nodes_modtime
BEFORE UPDATE ON public.share_nodes
FOR EACH ROW
EXECUTE FUNCTION update_share_modified_column();

CREATE TRIGGER update_share_projects_modtime
BEFORE UPDATE ON public.share_projects
FOR EACH ROW
EXECUTE FUNCTION update_share_modified_column();

-- Row Level Security (RLS)
ALTER TABLE public.share_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_log ENABLE ROW LEVEL SECURITY;

-- Example Policies (Simplify for initial setup)
CREATE POLICY "Enable all access for authenticated users" ON public.share_nodes FOR ALL USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.share_projects FOR ALL USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.share_project_members FOR ALL USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.share_links FOR ALL USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.share_whitelist FOR ALL USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.share_log FOR ALL USING (true);

-- RPC: get_total_usage
CREATE OR REPLACE FUNCTION get_total_usage(p_project_id UUID DEFAULT NULL)
RETURNS BIGINT AS $$
BEGIN
    IF p_project_id IS NULL THEN
        RETURN (SELECT SUM(size) FROM public.share_nodes WHERE type = 'file');
    ELSE
        RETURN (SELECT SUM(size) FROM public.share_nodes WHERE type = 'file' AND project_id = p_project_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: get_nodes_with_sizes (Simplified)
CREATE OR REPLACE FUNCTION get_nodes_with_sizes(p_project_id UUID, p_parent_id UUID, p_search_query TEXT)
RETURNS SETOF public.share_nodes AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.share_nodes
    WHERE (project_id = p_project_id OR (project_id IS NULL AND p_project_id IS NULL))
      AND (parent_id = p_parent_id OR (parent_id IS NULL AND p_parent_id IS NULL))
      AND (p_search_query IS NULL OR name ILIKE '%' || p_search_query || '%')
    ORDER BY type DESC, name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: is_descendant
CREATE OR REPLACE FUNCTION is_descendant(child_id UUID, ancestor_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_parent UUID;
BEGIN
    IF child_id = ancestor_id THEN RETURN TRUE; END IF;
    SELECT parent_id INTO current_parent FROM public.share_nodes WHERE id = child_id;
    IF current_parent IS NULL THEN RETURN FALSE; END IF;
    RETURN is_descendant(current_parent, ancestor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
