import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-example.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

// Keep the check boolean if we are using real keys
export const hasValidSupabaseEnv =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'YOUR_SUPABASE_URL';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type DriveNode = {
    id: string;
    name: string;
    type: 'folder' | 'file';
    parent_id: string | null;
    size: number | null;
    mime_type: string | null;
    r2_key: string | null;
    project_id: string | null;
    created_at: string;
    updated_at: string;
};
