import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendActivityNotification } from '@/lib/resend';

export const maxDuration = 60; // Extend timeout for batch operations

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { paths, projectId, parentId, silent } = body; // paths: string[] e.g. ["Folder", "Folder/Sub"]

        if (!projectId) {
            return NextResponse.json({ error: 'Project context required' }, { status: 400 });
        }
        if (!Array.isArray(paths) || paths.length === 0) {
            return NextResponse.json({ map: {} });
        }

        // Resolve Project ID
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

        // Check Permissions (ReadOnly)
        const { data: projectData } = await supabase.from('projects').select('name, created_by, settings').eq('id', resolvedProjectId).single();
        const { data: userRole } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
        if (projectData?.settings?.read_only && userRole?.role !== 'admin') {
            return NextResponse.json({ error: 'This project is in Read-Only mode.' }, { status: 403 });
        }

        const pathIdMap = new Map<string, string | null>();
        // Initialize root mapping
        pathIdMap.set("", parentId || null);

        // Group paths by depth
        const depthGroups: Map<number, string[]> = new Map();
        for (const fullPath of paths) {
            const depth = fullPath.split('/').length;
            if (!depthGroups.has(depth)) depthGroups.set(depth, []);
            depthGroups.get(depth)!.push(fullPath);
        }

        const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

        for (const depth of sortedDepths) {
            const currentLevelPaths = depthGroups.get(depth)!;

            // 1. Identify valid paths (whose parents exist in map)
            const validPaths = currentLevelPaths.filter(p => {
                const parentPath = p.split('/').slice(0, -1).join('/');
                return pathIdMap.has(parentPath);
            });

            if (validPaths.length === 0) continue;

            // 2. Bulk fetch existing nodes for this level
            const foldersToCheck = validPaths.map(p => {
                const parts = p.split('/');
                const name = parts[parts.length - 1];
                const parentPath = parts.slice(0, -1).join('/');
                return { name, parent_id: pathIdMap.get(parentPath), fullPath: p };
            });

            const names = Array.from(new Set(foldersToCheck.map(f => f.name)));
            const parentIds = Array.from(new Set(foldersToCheck.map(f => f.parent_id))).filter(id => id !== null) as string[];

            let existingNodes: { id: string, name: string, parent_id: string | null }[] = [];

            // Fetch in chunks if too many names/parents to avoid URI length issues
            const chunkSize = 50;
            for (let i = 0; i < names.length; i += chunkSize) {
                const nameChunk = names.slice(i, i + chunkSize);
                let query = supabase
                    .from('storage_nodes')
                    .select('id, name, parent_id')
                    .eq('project_id', resolvedProjectId)
                    .eq('type', 'FOLDER')
                    .in('name', nameChunk);

                // Filter by relevant parents to avoid 1000 row limit on generic names
                if (parentIds.length > 0) {
                    const orFilter = `parent_id.in.(${parentIds.map(id => `"${id}"`).join(',')})${depth === 1 ? ',parent_id.is.null' : ''}`;
                    query = query.or(orFilter);
                } else {
                    query = query.is('parent_id', null);
                }

                const { data } = await query;
                if (data) existingNodes = [...existingNodes, ...data];
            }

            const existingMap = new Map<string, string>(); // name:parent_id -> id
            existingNodes.forEach(n => {
                const key = `${n.name}:${n.parent_id || ""}`;
                existingMap.set(key, n.id);
            });

            const toCreate: { name: string, type: string, parent_id: string | null | undefined, project_id: string, created_by: string, owner_email: string | undefined, sharing_scope: string }[] = [];
            const toCreatePaths: string[] = [];

            for (const item of foldersToCheck) {
                const key = `${item.name}:${item.parent_id || ""}`;
                if (existingMap.has(key)) {
                    pathIdMap.set(item.fullPath, existingMap.get(key)!);
                } else {
                    toCreate.push({
                        name: item.name,
                        type: 'FOLDER',
                        parent_id: item.parent_id,
                        project_id: resolvedProjectId,
                        created_by: user.id,
                        owner_email: user.email,
                        sharing_scope: 'PRIVATE'
                    });
                    toCreatePaths.push(item.fullPath);
                }
            }

            // 3. Bulk Insert
            if (toCreate.length > 0) {
                const { data: createdNodes, error: insertError } = await supabase
                    .from('storage_nodes')
                    .insert(toCreate)
                    .select('id, name, parent_id');

                if (insertError) {
                    console.error(`Bulk insert failed at depth ${depth}:`, insertError);
                    // Fallback or skip? Skipping for now.
                } else if (createdNodes) {
                    // Match back by name:parent_id
                    const createdMap = new Map<string, string>();
                    createdNodes.forEach(n => {
                        const key = `${n.name}:${n.parent_id || ""}`;
                        createdMap.set(key, n.id);
                    });

                    // Assign to pathIdMap
                    // We must be careful about duplicates if they weren't caught in toCreate
                    // But toCreate was filtered by fullPath which is unique in paths array.
                    for (const p of toCreatePaths) {
                        const parts = p.split('/');
                        const name = parts[parts.length - 1];
                        const parentPath = parts.slice(0, -1).join('/');
                        const key = `${name}:${pathIdMap.get(parentPath) || ""}`;
                        if (createdMap.has(key)) {
                            pathIdMap.set(p, createdMap.get(key)!);
                        }
                    }
                }
            }
        }

        // Notification (Once for batch)
        if (!silent && projectData && projectData.created_by !== user.id && projectData.settings?.notify_on_activity) {
            const { data: rootFolder } = await supabase.from('storage_nodes').select('owner_email').eq('project_id', resolvedProjectId).is('parent_id', null).limit(1);
            if (rootFolder && rootFolder[0]?.owner_email) {
                await sendActivityNotification({
                    to: rootFolder[0].owner_email,
                    projectName: projectData.name,
                    userName: user.email || 'Unknown User',
                    action: 'UPLOADED',
                    fileName: `${paths.length} folders`,
                    timestamp: new Date().toLocaleString()
                });
            }
        }

        return NextResponse.json({ map: Object.fromEntries(pathIdMap) });

    } catch (error: unknown) {
        console.error('Batch Folder Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
