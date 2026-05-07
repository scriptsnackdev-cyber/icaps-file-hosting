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

export async function logDownload(nodeId: string, nodeName: string, projectId: string | null) {
    if (!hasValidSupabaseEnv || !projectId) return;
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email) {
        await logActivity({ projectId, userEmail: user.email, action: 'download', nodeId, nodeName });
    }
}
