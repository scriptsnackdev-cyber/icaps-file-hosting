import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');

    if (!nodeId) return NextResponse.json({ error: 'Node ID required' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // 1. Get the base node to find name/path/project
        const { data: baseNode, error: baseError } = await supabase
            .from('storage_nodes')
            .select('*')
            .eq('id', nodeId)
            .single();

        if (baseError || !baseNode) return NextResponse.json({ error: 'Node not found' }, { status: 404 });

        // 2. Fetch all versions with same name in same folder/project
        let query = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', baseNode.project_id)
            .eq('name', baseNode.name)
            .eq('type', 'FILE');

        if (baseNode.parent_id) query = query.eq('parent_id', baseNode.parent_id);
        else query = query.is('parent_id', null);

        const { data: versions, error: versionsError } = await query.order('version', { ascending: false });

        if (versionsError) throw versionsError;

        return NextResponse.json(versions);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { nodeId } = await request.json();
        if (!nodeId) return NextResponse.json({ error: 'Node ID required' }, { status: 400 });

        // 1. Fetch the selected version
        const { data: targetNode, error: fetchError } = await supabase
            .from('storage_nodes')
            .select('*')
            .eq('id', nodeId)
            .single();

        if (fetchError || !targetNode) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

        // 2. Permission check (Owner or Admin)
        const { data: whitelistUser } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
        const isAdmin = whitelistUser?.role === 'admin';
        const isOwner = targetNode.created_by === user.id || targetNode.owner_email === user.email;

        if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // 3. Find current highest version
        let query = supabase
            .from('storage_nodes')
            .select('version')
            .eq('project_id', targetNode.project_id)
            .eq('name', targetNode.name)
            .eq('type', 'FILE');

        if (targetNode.parent_id) query = query.eq('parent_id', targetNode.parent_id);
        else query = query.is('parent_id', null);

        const { data: versions } = await query.order('version', { ascending: false }).limit(1);
        const latestVersion = versions?.[0]?.version || 1;

        // 4. Create NEW record with old content but new version (Rollback = restore as new version)
        const { data: newNode, error: insertError } = await supabase.from('storage_nodes').insert({
            name: targetNode.name,
            type: 'FILE',
            parent_id: targetNode.parent_id,
            project_id: targetNode.project_id,
            r2_key: targetNode.r2_key,
            size: targetNode.size,
            mime_type: targetNode.mime_type,
            created_by: user.id,
            owner_email: user.email,
            sharing_scope: 'PRIVATE',
            version: latestVersion + 1
        }).select().single();

        if (insertError) throw insertError;

        return NextResponse.json(newNode);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
