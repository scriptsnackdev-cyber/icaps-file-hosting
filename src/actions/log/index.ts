'use server';

import { createServiceClient } from '@/utils/supabase/server';
import { hasValidSupabaseEnv } from '@/lib/supabase';
import { createClient } from '@/utils/supabase/server';

export async function logActivity(params: {
    projectId: string | null | undefined;
    userEmail: string;
    action: string;
    nodeId?: string | null;
    nodeName: string;
    metadata?: Record<string, unknown>;
}) {
    if (!hasValidSupabaseEnv || !params.projectId) return;
    try {
        // Use service client so logging never fails due to RLS
        await createServiceClient().from('share_log').insert({
            project_id: params.projectId,
            user_email: params.userEmail,
            action: params.action,
            node_id: params.nodeId ?? null,
            node_name: params.nodeName,
            metadata: params.metadata ?? null,
        });
    } catch (_) {
        // Logging is a side-effect — never break the main operation
    }
}

export type ActivityLog = {
    id: string;
    project_id: string;
    user_email: string;
    action: string;
    node_id: string | null;
    node_name: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
};

export async function logDownload(nodeId: string, nodeName: string, projectId: string | null) {
    if (!hasValidSupabaseEnv || !projectId) return;
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email) {
        await logActivity({ projectId, userEmail: user.email, action: 'download', nodeId, nodeName });
    }
}

export async function fetchProjectLogs(projectId: string): Promise<ActivityLog[]> {
    if (!hasValidSupabaseEnv) return [];
    const { data, error } = await (await createClient())
        .from('share_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error fetching project logs:', error);
        return [];
    }
    return data as ActivityLog[];
}
