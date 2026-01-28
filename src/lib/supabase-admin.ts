import { createClient } from '@supabase/supabase-js';

// Note: SUPABASE_SERVICE_ROLE_KEY must be kept secret and only used on the server.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Falling back to ANON key. Admin privileges (RLS bypass) will NOT work.");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
