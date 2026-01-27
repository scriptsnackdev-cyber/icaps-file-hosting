import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parentId');
    const path = searchParams.get('path'); // e.g. "folder1/folder2"
    const projectId = searchParams.get('project');

    if (!projectId) {
        return NextResponse.json({ error: 'Project context required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Resolve Project ID if it's a name/slug
        let resolvedProjectId = projectId;
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
        let childrenQuery = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', resolvedProjectId) // Filter by Project!
            .order('type', { ascending: false }) // Folders first
            .order('name', { ascending: true });

        if (currentFolderId) {
            childrenQuery = childrenQuery.eq('parent_id', currentFolderId);
        } else {
            childrenQuery = childrenQuery.is('parent_id', null);
        }

        const { data: nodes, error: childrenError } = await childrenQuery;

        if (childrenError) throw childrenError;

        // Fetch latest project stats for quota update
        const { data: project } = await supabase
            .from('projects')
            .select('*')
            .eq('id', resolvedProjectId)
            .single();

        return NextResponse.json({
            nodes: nodes || [],
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
        const { type, name, parentId, projectId } = body;

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

        return NextResponse.json(data);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project');

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

        // 2. Process children
        if (children && children.length > 0) {
            for (const child of children) {
                if (child.type === 'FOLDER') {
                    await deleteNodeRecursively(child.id);
                } else {
                    // It's a file
                    totalDeletedSize += (child.size || 0);
                    if (child.r2_key) {
                        try {
                            await r2.send(new DeleteObjectCommand({
                                Bucket: R2_BUCKET_NAME,
                                Key: child.r2_key,
                            }));
                        } catch (e) {
                            console.error(`Failed to delete R2 object ${child.r2_key}`, e);
                        }
                    }
                    await supabase.from('storage_nodes').delete().eq('id', child.id);
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

        const targetProjectId = targetNode.project_id;

        if (targetNode.type === 'FILE') {
            totalDeletedSize = targetNode.size || 0;
            if (targetNode.r2_key) {
                await r2.send(new DeleteObjectCommand({
                    Bucket: R2_BUCKET_NAME,
                    Key: targetNode.r2_key,
                }));
            }
            const { error: delError } = await supabase.from('storage_nodes').delete().eq('id', id);
            if (delError) throw delError;
        } else {
            await deleteNodeRecursively(id);
        }

        // Update Project Usage (Decrement)
        if (totalDeletedSize > 0 && targetProjectId) {
            await supabase.rpc('decrement_project_storage', {
                p_id: targetProjectId,
                amount: totalDeletedSize
            });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Delete Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
