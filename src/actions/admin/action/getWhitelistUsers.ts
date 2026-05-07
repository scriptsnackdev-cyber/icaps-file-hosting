'use server';

import { createClient } from '@/utils/supabase/server';
import { hasValidSupabaseEnv } from '@/lib/supabase';

export async function getWhitelistUsers(): Promise<{ email: string; role: string }[]> {
    if (!hasValidSupabaseEnv) return [];
    const { data, error } = await (await createClient()).from('share_whitelist').select('email, role').order('email');
    if (error) return [];
    return data ?? [];
}
