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

        return NextResponse.json(project.settings || { notify_on_activity: false });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { projectId, settings } = await request.json();

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
        const newSettings = { ...(project.settings || {}), ...settings };

        const { data: updatedProject, error: updateError } = await supabase
            .from('projects')
            .update({ settings: newSettings })
            .eq('id', projectId)
            .select()
            .single();

        if (updateError) throw updateError;

        return NextResponse.json(updatedProject.settings);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
