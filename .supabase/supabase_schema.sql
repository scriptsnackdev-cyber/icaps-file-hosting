-- SharePoint Clone Database Schema
-- Run this in your Supabase SQL Editor

-- Create enum for node types
CREATE TYPE share_node_type AS ENUM ('file', 'folder');

-- Create the main nodes table
CREATE TABLE IF NOT EXISTS public.share_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type share_node_type NOT NULL,
    parent_id UUID REFERENCES public.share_nodes(id) ON DELETE CASCADE,
    size BIGINT, -- File size in bytes (NULL for folders)
    mime_type TEXT, -- MIME type (NULL for folders)
    r2_key TEXT, -- The object key used in Cloudflare R2 (NULL for folders)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an index to quickly load a folder's contents
CREATE INDEX IF NOT EXISTS idx_share_nodes_parent_id ON public.share_nodes(parent_id);

-- Optional: Create a function and trigger to automatically update `updated_at`
CREATE OR REPLACE FUNCTION update_share_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_share_nodes_modtime
BEFORE UPDATE ON public.share_nodes
FOR EACH ROW
EXECUTE FUNCTION update_share_modified_column();

-- Enable Row Level Security (Since this is a demo without strict auth, we allow all for now)
ALTER TABLE public.share_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.share_nodes
    FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON public.share_nodes
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON public.share_nodes
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON public.share_nodes
    FOR DELETE USING (true);

-- ==========================================
-- WHITELIST AND OTP AUTHENTICATION
-- ==========================================

-- Create enum for user roles
CREATE TYPE public.share_user_role AS ENUM ('admin', 'user');

-- Create whitelist table
CREATE TABLE IF NOT EXISTS public.share_whitelist (
    email TEXT PRIMARY KEY,
    role public.share_user_role DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Note: The first admin should be inserted manually into the `share_whitelist` table
-- e.g. INSERT INTO public.share_whitelist(email, role) VALUES ('admin@example.com', 'admin');

-- Enable RLS on whitelist
ALTER TABLE public.share_whitelist ENABLE ROW LEVEL SECURITY;

-- Users can read the whitelist
CREATE POLICY "Everyone can read whitelist" ON public.share_whitelist
    FOR SELECT USING (true);

-- Admins can insert/update/delete on whitelist
-- We use separate policies to prevent infinite recursion, avoiding FOR ALL
DROP POLICY IF EXISTS "Admins can manage whitelist" ON public.share_whitelist;

CREATE POLICY "Admins can insert whitelist" ON public.share_whitelist
    FOR INSERT WITH CHECK (
        (SELECT role FROM public.share_whitelist WHERE email = auth.jwt()->>'email') = 'admin'
    );

CREATE POLICY "Admins can update whitelist" ON public.share_whitelist
    FOR UPDATE USING (
        (SELECT role FROM public.share_whitelist WHERE email = auth.jwt()->>'email') = 'admin'
    );

CREATE POLICY "Admins can delete whitelist" ON public.share_whitelist
    FOR DELETE USING (
        (SELECT role FROM public.share_whitelist WHERE email = auth.jwt()->>'email') = 'admin'
    );

-- Trigger to restrict signup to whitelisted emails only
CREATE OR REPLACE FUNCTION public.check_share_whitelist_before_signup()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.share_whitelist WHERE email = NEW.email) THEN
        RAISE EXCEPTION 'Email % is not in the whitelist', NEW.email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ensure_share_whitelisted_signup ON auth.users;
CREATE TRIGGER ensure_share_whitelisted_signup
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.check_share_whitelist_before_signup();

-- ==========================================
-- FILE SHARING LINKS
-- ==========================================

CREATE TABLE IF NOT EXISTS public.share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID REFERENCES public.share_nodes(id) ON DELETE CASCADE,
    password_hash TEXT, -- Nullable if no password required
    expires_at TIMESTAMPTZ, -- Nullable if it doesn't expire
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- Admins and Users can manage all share links in this open system (or restrict to creators later)
CREATE POLICY "All users can manage share links" ON public.share_links
    FOR ALL USING (
        auth.role() = 'authenticated'
    );

-- Anonymous users (and everyone else) can READ a share link if they have the ID (this is needed to render the password prompt)
CREATE POLICY "Anyone can read a share link by ID" ON public.share_links
    FOR SELECT USING (true);
