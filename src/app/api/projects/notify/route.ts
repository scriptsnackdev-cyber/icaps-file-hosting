import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendActivityNotification } from '@/lib/resend';

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { projectId, action, fileName } = await request.json();

        if (!projectId || !action || !fileName) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const { data: project, error: projError } = await supabase
            .from('projects')
            .select('name, created_by, settings')
            .eq('id', projectId)
            .single();

        if (projError || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Permission: Project members or admins
        // In this context, we just check if notify_on_activity is on and user is not owner
        if (project.created_by !== user.id && project.settings?.notify_on_activity) {
            // Fetch owner email using Admin Client (Service Role)
            // We need this because we can't query other users' emails directly from client SDK usually
            const { createClient: createAdminClient } = require('@supabase/supabase-js');
            const supabaseAdmin = createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    }
                }
            );

            const { data: { user: ownerUser }, error: ownerError } = await supabaseAdmin.auth.admin.getUserById(project.created_by);

            if (!ownerError && ownerUser?.email) {
                await sendActivityNotification({
                    to: ownerUser.email,
                    projectName: project.name,
                    userName: user.email || 'Unknown User',
                    action: action as any,
                    fileName: fileName,
                    timestamp: new Date().toLocaleString()
                });
            } else {
                console.error("Failed to fetch project owner email for notification:", ownerError);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
