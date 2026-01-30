import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { sendActivityNotification } from '@/lib/resend';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parentId');
    const path = searchParams.get('path'); // e.g. "folder1/folder2"
    const projectId = searchParams.get('project');

    const isTrashView = searchParams.get('view') === 'trash';

    if (!projectId && !isTrashView) {
        return NextResponse.json({ error: 'Project context required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        let resolvedProjectId = projectId;
        if (projectId) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);

            if (!isUUID) {
                // Try to find by name - Use limit(1) to avoid duplicate name issues
                const { data: projs } = await supabase
                    .from('projects')
                    .select('id')
                    .eq('name', decodeURIComponent(projectId))
                    .limit(1);

                if (projs && projs.length > 0) {
                    resolvedProjectId = projs[0].id;
                } else {
                    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
                }
            }
        }
        let currentFolderId: string | null = null;
        let chain: { id: string, name: string }[] = [];

        // Resolve Path to ID if 'path' is provided and not empty
        if (path && path !== '/') {
            const segments = path.split('/').filter(Boolean);
            let currentParentId: string | null = null;

            for (const segment of segments) {
                // Find folder with this name under current parent AND within project
                const decodedSegment = decodeURIComponent(segment);

                let query = supabase
                    .from('storage_nodes')
                    .select('id, name')
                    .eq('project_id', resolvedProjectId)
                    .eq('name', decodedSegment)
                    .eq('type', 'FOLDER');

                if (currentParentId) {
                    query = query.eq('parent_id', currentParentId);
                } else {
                    query = query.is('parent_id', null);
                }

                const { data: folder, error } = await query.single();

                if (error || !folder) {
                    return NextResponse.json({ error: `Folder '${decodedSegment}' not found in project` }, { status: 404 });
                }

                currentParentId = folder.id;
                chain.push({ id: folder.id, name: folder.name });
            }
            currentFolderId = currentParentId;
        } else if (parentId) {
            currentFolderId = parentId;
            // TODO: Validate parentId belongs to resolvedProjectId
        }

        // Fetch Children of Resolved ID within Project
        // Initialize Base Query
        let childrenQuery = supabase
            .from('storage_nodes')
            .select(isTrashView ? '*, projects(name)' : '*')
            .order('type', { ascending: false })
            .order('name', { ascending: true });

        if (isTrashView) {
            // Trash view: Flat list of items marked as TRASHED
            // Re-initialize query for trash to be safe/clear
            childrenQuery = supabase
                .from('storage_nodes')
                .select('*, projects(name)')
                .eq('status', 'TRASHED')
                .order('trashed_at', { ascending: false, nullsFirst: true });

            if (resolvedProjectId) {
                childrenQuery = childrenQuery.eq('project_id', resolvedProjectId);
            } else {
                // Global Trash: Show user's own trash across all projects
                childrenQuery = childrenQuery.eq('owner_email', user.email);
            }

        } else {
            // Normal View: Filter out deleted and trashed
            childrenQuery = childrenQuery.eq('project_id', resolvedProjectId);

            if (currentFolderId) {
                childrenQuery = childrenQuery.eq('parent_id', currentFolderId);
            } else {
                childrenQuery = childrenQuery.is('parent_id', null);
            }
            childrenQuery = childrenQuery.or('status.eq.ACTIVE,status.is.null');
        }

        const { data: nodesData, error: childrenError } = await childrenQuery;
        if (childrenError) throw childrenError;
        const nodes = nodesData as any[];

        // Version Control Filter: Show only the latest version of each file name
        const latestNodesMap = new Map<string, any>();
        (nodes || []).forEach(node => {
            const existing = latestNodesMap.get(node.name);
            if (!existing || (node.version || 1) > (existing.version || 1)) {
                latestNodesMap.set(node.name, node);
            }
        });
        const filteredNodes = Array.from(latestNodesMap.values())
            .sort((a, b) => {
                // Keep the original sorting: Folders first, then Name
                if (a.type !== b.type) return b.type === 'FOLDER' ? 1 : -1;
                return a.name.localeCompare(b.name);
            });

        // Fetch latest project stats for quota update
        const { data: project } = await supabase
            .from('projects')
            .select('*')
            .eq('id', resolvedProjectId)
            .single();

        return NextResponse.json({
            nodes: filteredNodes,
            currentFolderId: currentFolderId,
            breadcrumbs: chain,
            project: project
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { type, name, parentId, projectId, silent } = body;

        if (!projectId) {
            return NextResponse.json({ error: 'Project context required' }, { status: 400 });
        }

        // Resolve Project ID if it's a name/slug
        let resolvedProjectId = projectId;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);

        if (!isUUID) {
            const { data: projs } = await supabase
                .from('projects')
                .select('id')
                .eq('name', decodeURIComponent(projectId))
                .limit(1);

            if (projs && projs.length > 0) {
                resolvedProjectId = projs[0].id;
            } else {
                return NextResponse.json({ error: 'Project not found' }, { status: 404 });
            }
        }

        // --- READ ONLY CHECK ---
        const { data: projectData } = await supabase.from('projects').select('settings').eq('id', resolvedProjectId).single();
        const { data: userRole } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
        if (projectData?.settings?.read_only && userRole?.role !== 'admin') {
            return NextResponse.json({ error: 'This project is in Read-Only mode.' }, { status: 403 });
        }

        if (type !== 'FOLDER') {
            return NextResponse.json({ error: 'Only Folder creation allowed via JSON. Use Upload API for files.' }, { status: 400 });
        }

        // Check if folder exists
        let query = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', resolvedProjectId)
            .eq('name', name)
            .eq('type', 'FOLDER');

        if (parentId) {
            query = query.eq('parent_id', parentId);
        } else {
            query = query.is('parent_id', null);
        }

        const { data: existing, error: findError } = await query.single();

        if (existing) {
            return NextResponse.json(existing);
        }

        // Create it linked to Project
        const { data, error } = await supabase.from('storage_nodes').insert({
            name,
            type: 'FOLDER',
            parent_id: parentId || null,
            project_id: resolvedProjectId,
            created_by: user.id,
            owner_email: user.email,
            sharing_scope: 'PRIVATE'
        }).select().single();

        if (error) throw error;

        // --- EMAIL NOTIFICATION for Folders ---
        try {
            if (!silent && resolvedProjectId && type === 'FOLDER') {
                const { data: project } = await supabase.from('projects').select('name, created_by, settings').eq('id', resolvedProjectId).single();
                if (project && project.created_by !== user.id && project.settings?.notify_on_activity) {
                    const { data: rootFolder } = await supabase.from('storage_nodes').select('owner_email').eq('project_id', resolvedProjectId).is('parent_id', null).limit(1).single();
                    if (rootFolder?.owner_email) {
                        await sendActivityNotification({
                            to: rootFolder.owner_email,
                            projectName: project.name,
                            userName: user.email || 'Unknown User',
                            action: 'UPLOADED',
                            fileName: name,
                            timestamp: new Date().toLocaleString()
                        });
                    }
                }
            }
        } catch (e) { console.error("Notification failed", e); }

        return NextResponse.json(data);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project');
    const permanent = searchParams.get('permanent') === 'true';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
        return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    let resolvedProjectId = projectId;
    if (projectId) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
        if (!isUUID) {
            const { data: projs } = await supabase
                .from('projects')
                .select('id')
                .eq('name', decodeURIComponent(projectId))
                .limit(1);
            if (projs && projs.length > 0) {
                resolvedProjectId = projs[0].id;
            }
        }
    }

    let totalDeletedSize = 0;

    // Helper to delete a single node and its physical file if applicable
    const deleteNodeRecursively = async (nodeId: string) => {
        // 1. Fetch children
        const { data: children, error } = await supabase
            .from('storage_nodes')
            .select('*')
            .eq('parent_id', nodeId);

        if (error) throw error;

        // Keep track of names already processed in this folder to avoid redundant version deletions
        const processedFileNames = new Set<string>();

        // 2. Process children
        if (children && children.length > 0) {
            for (const child of children) {
                if (child.type === 'FOLDER') {
                    await deleteNodeRecursively(child.id);
                } else {
                    // It's a file - ensure we delete ALL versions of this file in this folder
                    if (!processedFileNames.has(child.name)) {
                        processedFileNames.add(child.name);

                        // Fetch all versions of this specific file in this specific parent
                        const { data: allVersions } = await supabase
                            .from('storage_nodes')
                            .select('*')
                            .eq('project_id', child.project_id)
                            .eq('name', child.name)
                            .eq('type', 'FILE')
                            .eq('parent_id', nodeId); // All versions MUST share the same parent in our logic

                        if (allVersions) {
                            for (const v of allVersions) {
                                totalDeletedSize += (v.size || 0);
                                if (v.r2_key) {
                                    try {
                                        await r2.send(new DeleteObjectCommand({
                                            Bucket: R2_BUCKET_NAME,
                                            Key: v.r2_key,
                                        }));
                                    } catch (e) {
                                        console.error(`Failed to delete R2 object ${v.r2_key}`, e);
                                    }
                                }
                                await supabase.from('storage_nodes').delete().eq('id', v.id);
                            }
                        }
                    }
                }
            }
        }

        // 3. Delete the folder itself
        await supabase.from('storage_nodes').delete().eq('id', nodeId);
    };


    try {
        // Fetch the target node first
        const { data: targetNode, error: fetchError } = await supabase
            .from('storage_nodes')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !targetNode) {
            return NextResponse.json({ error: 'Node not found or permission denied' }, { status: 404 });
        }

        // Check Permissions: Admin (via Whitelist) OR Owner
        const { data: whitelistData } = await supabase
            .from('whitelist')
            .select('role')
            .eq('email', user.email)
            .single();

        const isAdmin = whitelistData?.role === 'admin';
        const isOwner = targetNode.created_by === user.id || targetNode.owner_email === user.email;

        if (!isAdmin && !isOwner) {
            return NextResponse.json({ error: 'Access Denied: You can only delete your own files.' }, { status: 403 });
        }

        // --- READ ONLY CHECK ---
        const { data: projectData } = await supabase.from('projects').select('settings').eq('id', targetNode.project_id).single();
        if (projectData?.settings?.read_only && !isAdmin) {
            return NextResponse.json({ error: 'This project is in Read-Only mode.' }, { status: 403 });
        }

        const targetProjectId = targetNode.project_id;

        if (targetNode.type === 'FILE') {
            const isOwner = targetNode.created_by === user.id || targetNode.owner_email === user.email;
            if (!isAdmin && !isOwner) { // Double check logic
                // Already checked above, but safe to keep structure or simplify
            }
        }

        // --- SOFT DELETE vs TRASH ---
        if (permanent) {
            // PERMANENT DELETE (Original Logic)

            // 1. Mark as DELETED_PENDING immediately so it disappears from UI
            const { error: updateError } = await supabase
                .from('storage_nodes')
                .update({ status: 'DELETED_PENDING' })
                .eq('id', id);

            if (updateError) throw updateError;

            // 2. Fire and Forget: Invoke Background Edge Function to clean up R2 and DB rows
            const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-nodes`;

            fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    nodeId: id,
                    projectId: targetNode.project_id,
                    userEmail: user.email,
                    isAdmin: isAdmin
                })
            }).catch(err => console.error("Failed to trigger background delete:", err));

            return NextResponse.json({ success: true, message: 'Permanently deleted', deletedSize: 0 });

        } else {
            // MOVE TO TRASH
            const { error: updateError } = await supabase
                .from('storage_nodes')
                .update({
                    status: 'TRASHED',
                    trashed_at: new Date().toISOString()
                })
                .eq('id', id);

            if (updateError) throw updateError;

            return NextResponse.json({ success: true, message: 'Moved to trash' });
        }

    } catch (error: any) {
        console.error("Delete Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { id, sharing_scope, share_password, parentId, name, status } = body;

        if (!id) {
            return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
        }

        // 1. Fetch Node to check ownership
        const { data: node, error: fetchError } = await supabase
            .from('storage_nodes')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !node) {
            return NextResponse.json({ error: 'Node not found' }, { status: 404 });
        }

        // 2. Check Permissions
        const { data: whitelistData } = await supabase
            .from('whitelist')
            .select('role')
            .eq('email', user.email)
            .single();

        const isAdmin = whitelistData?.role === 'admin';
        const isOwner = node.created_by === user.id || node.owner_email === user.email;

        // --- READ ONLY CHECK ---
        const { data: projectData } = await supabase.from('projects').select('settings').eq('id', node.project_id).single();
        if (projectData?.settings?.read_only && !isAdmin) {
            return NextResponse.json({ error: 'This project is in Read-Only mode.' }, { status: 403 });
        }

        if (!isAdmin && !isOwner) {
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 });
        }

        // 3. Update Node
        const updates: any = {};
        if (status) {
            updates.status = status;
            if (status === 'ACTIVE') {
                updates.trashed_at = null;
            }
        }
        if (sharing_scope) updates.sharing_scope = sharing_scope;
        if (parentId !== undefined) updates.parent_id = parentId; // Support for Moving
        // Allow setting password to null (empty string/null)
        if (share_password !== undefined) updates.share_password = share_password;

        if (name && name !== node.name) {
            updates.name = name;

            // Rename in R2 if it's a file
            if (node.type === 'FILE' && node.r2_key && node.r2_key.endsWith(node.name)) {
                const oldKey = node.r2_key;
                const newKey = oldKey.slice(0, -node.name.length) + name;

                try {
                    await r2.send(new CopyObjectCommand({
                        Bucket: R2_BUCKET_NAME,
                        CopySource: `${R2_BUCKET_NAME}/${oldKey.split('/').map(encodeURIComponent).join('/')}`,
                        Key: newKey
                    }));

                    await r2.send(new DeleteObjectCommand({
                        Bucket: R2_BUCKET_NAME,
                        Key: oldKey
                    }));

                    updates.r2_key = newKey;
                } catch (e: any) {
                    console.error("R2 Rename Error:", e);
                    // If R2 fails, we probably shouldn't rename in DB to keep consistency
                    return NextResponse.json({ error: 'Failed to update Cloud storage: ' + e.message }, { status: 500 });
                }
            }
        }

        updates.updated_at = new Date().toISOString();

        const { data: updatedNode, error: updateError } = await supabase
            .from('storage_nodes')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        return NextResponse.json(updatedNode);

    } catch (error: any) {
        console.error("Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
