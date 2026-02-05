-- Fix for Project Members: Allow one user to be in multiple projects.
-- Currently, there might be a unique constraint on 'user_email' which prevents this.
-- This script removes that constraint and ensures the correct composite constraint exists.

-- 1. Drop the incorrect unique constraint on user_email alone (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_user_email_key') THEN
        ALTER TABLE project_members DROP CONSTRAINT project_members_user_email_key;
    END IF;
END $$;

-- 2. Ensure the correct unique constraint (project_id + user_email) exists
-- This allows (Project A, User 1) and (Project B, User 1) to coexist.
-- We use Exception handling to ignore if it already exists.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'project_members_project_id_user_email_key'
    ) THEN
        ALTER TABLE project_members ADD CONSTRAINT project_members_project_id_user_email_key UNIQUE (project_id, user_email);
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        -- Handle rare race conditions or specific errors if needed, but usually redundant here
        NULL;
    WHEN others THEN
        -- If constraint already exists with a different name but same columns, we might just leave it?
        -- But strictly we want to ensure the logic.
        RAISE NOTICE 'Constraint might already exist or another error occurred: %', SQLERRM;
END $$;
