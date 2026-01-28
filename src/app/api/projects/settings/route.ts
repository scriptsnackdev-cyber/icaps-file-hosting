import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: project, error: fetchError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (fetchError || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Permission: Only owner or admin
        const { data: whitelistUser } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
        const isAdmin = whitelistUser?.role === 'admin';
        const isOwner = project.created_by === user.id;

        if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // Fetch members
        const { data: membersData } = await supabase
            .from('project_members')
            .select('user_email')
            .eq('project_id', projectId);

        const textSettings = project.settings || { notify_on_activity: false };
        return NextResponse.json({
            ...textSettings,
            members: membersData?.map(m => m.user_email) || []
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { projectId, settings, members } = await request.json();

        if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

        // 1. Fetch project to check ownership
        const { data: project, error: fetchError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (fetchError || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // 2. Permission Check
        const { data: whitelistUser } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
        const isAdmin = whitelistUser?.role === 'admin';
        const isOwner = project.created_by === user.id;

        if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // 3. Update settings (merge with existing)
        let updatedSettings = project.settings;
        if (settings) {
            updatedSettings = { ...(project.settings || {}), ...settings };
            const { error: updateError } = await supabase
                .from('projects')
                .update({ settings: updatedSettings })
                .eq('id', projectId);

            if (updateError) throw updateError;
        }

        // 4. Update Members if provided
        if (members && Array.isArray(members)) {
            // Get current members
            const { data: currentMembers } = await supabase.from('project_members').select('user_email').eq('project_id', projectId);
            const currentEmails = new Set<string>(currentMembers?.map(m => m.user_email) || []);
            const newEmails = new Set<string>(members);

            const toAdd = [...newEmails].filter(e => !currentEmails.has(e));
            const toRemove = [...currentEmails].filter(e => !newEmails.has(e));

            if (toAdd.length > 0) {
                await supabase.from('project_members').insert(toAdd.map(email => ({ project_id: projectId, user_email: email })));
            }

            if (toRemove.length > 0) {
                await supabase.from('project_members').delete().eq('project_id', projectId).in('user_email', toRemove);
            }
        }

        return NextResponse.json({ success: true, settings: updatedSettings, members });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
