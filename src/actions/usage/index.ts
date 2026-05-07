'use server';

import { createClient } from '@/utils/supabase/server';
import { hasValidSupabaseEnv } from '@/lib/supabase';

export async function getTotalUsage(projectId?: string) {
    if (!hasValidSupabaseEnv) return 0;

    // Supabase RPC requires p_project_id
    const { data, error } = await (await createClient()).rpc('get_total_usage', { p_project_id: projectId || null });
    if (error) {
        console.error('Error fetching total usage:', error);
        return 0;
    }
    return Number(data) || 0;
}
