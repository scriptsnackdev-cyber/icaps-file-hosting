import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, password } = body;

        if (!id) {
            return NextResponse.json({ error: 'Node ID required' }, { status: 400 });
        }

        // 1. Fetch Node with Admin Client (Bypass RLS)
        const { data: node, error } = await supabaseAdmin
            .from('storage_nodes')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !node) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // 3. Check User Session
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const userEmail = user?.email?.toLowerCase() || '';
        let isMember = false;
        let projectUUID = node.project_id;
        let folderPathString = '';

        if (user) {
            // 1. Basic Membership (Owner/Creator of Node)
            if (node.created_by === user.id || (node.owner_email && node.owner_email.toLowerCase() === userEmail)) {
                isMember = true;
            }

            // 2. Project Membership & Admin Check
            if (node.project_id) {
                // Check Admin Status
                const { data: whitelistData } = await supabaseAdmin
                    .from('whitelist')
                    .select('role')
                    .eq('email', user.email!)
                    .single();

                if (whitelistData?.role === 'admin') {
                    isMember = true;
                } else {
                    // Check Project Creator
                    const { data: project } = await supabaseAdmin
                        .from('projects')
                        .select('created_by')
                        .eq('id', node.project_id)
                        .single();

                    if (project && project.created_by === user.id) {
                        isMember = true;
                    } else {
                        // Check project_members table
                        const { data: membership } = await supabaseAdmin
                            .from('project_members')
                            .select('id')
                            .eq('project_id', node.project_id)
                            .eq('user_email', user.email!)
                            .maybeSingle();

                        if (membership) isMember = true;
                    }
                }
            }

            // 3. Path Calculation (Only if confirmed Member)
            if (isMember) {
                let folderToViewId = node.type === 'FOLDER' ? node.id : node.parent_id;
                const segments: string[] = [];
                let depth = 0;
                while (folderToViewId && depth < 20) {
                    const { data: f } = await supabaseAdmin
                        .from('storage_nodes')
                        .select('id, name, parent_id')
                        .eq('id', folderToViewId)
                        .single();
                    if (!f) break;
                    segments.unshift(f.name);
                    folderToViewId = f.parent_id;
                    depth++;
                }
                folderPathString = segments.map(s => encodeURIComponent(s)).join('/');
            }
        }

        // 4. Member Redirect Priority
        if (isMember) {
            return NextResponse.json({ ...node, isMember: true, projectUUID, folderPath: folderPathString });
        }

        // 2. Check Sharing Scope (for PUBLIC access)
        if (node.sharing_scope === 'PUBLIC') {
            if (node.share_password) {
                if (!password) {
                    return NextResponse.json({ error: 'Password required', passwordObject: true }, { status: 403 });
                }
                if (password !== node.share_password) {
                    return NextResponse.json({ error: 'Invalid password', passwordObject: true }, { status: 403 });
                }
            }
            return NextResponse.json(node);
        }

        // 3. Private Scope (Non-members)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return NextResponse.json({ error: 'Access Denied' }, { status: 403 });

    } catch (error: any) {
        console.error("Public Node Fetch Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
