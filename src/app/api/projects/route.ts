import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Try to get user role
    const { data: whitelistUser } = await supabase
        .from('whitelist')
        .select('role')
        .eq('email', user.email)
        .single();

    const role = whitelistUser?.role || 'user';

    try {
        let query = supabase.from('projects').select('*');

        if (role !== 'admin') {
            // For normal users, fetch projects they are a member of
            // First get project IDs from mapping table
            const { data: memberships } = await supabase
                .from('project_members')
                .select('project_id')
                .eq('user_email', user.email);

            const projectIds = memberships?.map(m => m.project_id) || [];
            if (projectIds.length === 0) return NextResponse.json([]); // No projects

            query = query.in('id', projectIds);
        }

        const { data: projects, error } = await query;
        if (error) throw error;

        return NextResponse.json(projects);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Admin
    const { data: whitelistUser } = await supabase
        .from('whitelist')
        .select('role')
        .eq('email', user.email)
        .single();

    if (whitelistUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { name, max_storage_bytes, members } = body; // members = array of emails

        // 1. Create Project
        const { data: project, error: createError } = await supabase
            .from('projects')
            .insert({
                name,
                max_storage_bytes: max_storage_bytes || 107374182400, // 100GB
                created_by: user.id
            })
            .select()
            .single();

        if (createError) throw createError;

        // 2. Add Members (Admin + Provided Emails)
        const membersSet = new Set<string>(members || []);
        membersSet.add(user.email!);

        const memberInserts = Array.from(membersSet).map(email => ({
            project_id: project.id,
            user_email: email
        }));

        if (memberInserts.length > 0) {
            const { error: memberError } = await supabase
                .from('project_members')
                .insert(memberInserts);

            if (memberError) console.error("Error adding members:", memberError);
        }

        return NextResponse.json(project);

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Admin
    const { data: whitelistUser } = await supabase
        .from('whitelist')
        .select('role')
        .eq('email', user.email)
        .single();

    if (whitelistUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');

    if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

    try {
        // 1. Fetch all storage nodes for this project to delete R2 files
        const { data: nodes } = await supabase
            .from('storage_nodes')
            .select('r2_key')
            .eq('project_id', projectId)
            .not('r2_key', 'is', null);

        // 2. Delete from R2
        if (nodes && nodes.length > 0) {
            await Promise.all(nodes.map(async (node) => {
                try {
                    await r2.send(new DeleteObjectCommand({
                        Bucket: R2_BUCKET_NAME,
                        Key: node.r2_key!,
                    }));
                } catch (e) {
                    console.error(`Failed to delete R2 object ${node.r2_key}`, e);
                }
            }));
        }

        // 3. Delete Project and all related data (assuming cascades or manual cleanup)
        // Manual cleanup to be safe:
        await supabase.from('storage_nodes').delete().eq('project_id', projectId);
        await supabase.from('project_members').delete().eq('project_id', projectId);
        const { error: delError } = await supabase.from('projects').delete().eq('id', projectId);

        if (delError) throw delError;

        return NextResponse.json({ success: true });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Admin
    const { data: whitelistUser } = await supabase
        .from('whitelist')
        .select('role')
        .eq('email', user.email)
        .single();

    if (whitelistUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id, notify_on_activity, version_retention_limit, read_only, members } = body;

        if (!id) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

        // 1. Update project settings
        const updateData: any = {};
        if (typeof notify_on_activity !== 'undefined') updateData.notify_on_activity = notify_on_activity;
        if (typeof version_retention_limit !== 'undefined') updateData.version_retention_limit = version_retention_limit;
        if (typeof read_only !== 'undefined') updateData.read_only = read_only;

        if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabase
                .from('projects')
                .update(updateData)
                .eq('id', id);

            if (updateError) throw updateError;
        }

        // 2. Update members if provided
        if (members && Array.isArray(members)) {
            // Delete existing members
            const { error: deleteError } = await supabase
                .from('project_members')
                .delete()
                .eq('project_id', id);

            if (deleteError) throw deleteError;

            // Insert new members
            const memberInserts = members.map((email: string) => ({
                project_id: id,
                user_email: email
            }));

            if (memberInserts.length > 0) {
                const { error: insertError } = await supabase
                    .from('project_members')
                    .insert(memberInserts);

                if (insertError) throw insertError;
            }
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
