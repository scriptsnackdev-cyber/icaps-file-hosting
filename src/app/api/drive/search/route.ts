import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const projectId = searchParams.get('projectId');

    if (!query || !projectId) {
        return NextResponse.json({ error: 'Query and Project ID required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Check Project Permission
        const { data: project } = await supabase
            .from('projects')
            .select('id, name')
            .eq('id', projectId) // Filter by ID directly regardless of slug logic in frontend, API expects ID
            .single();

        // Note: We might receive a slug as projectId from frontend, so let's resolve it if needed, 
        // but for search efficiency, frontend should pass the UUID if possible. 
        // Let's assume frontend passes UUID for now, or we handle it safely.

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

        // 2. Perform Search
        // We match name case-insensitive
        const { data: results, error } = await supabase
            .from('storage_nodes')
            .select('id, name, type, parent_id, updated_at, size, owner_email')
            .eq('project_id', resolvedProjectId)
            .ilike('name', `%${query}%`)
            .neq('status', 'DELETED_PENDING') // Exclude deleted
            .limit(20);

        if (error) throw error;

        // 3. Resolve Paths
        // We need the full breadcrumb path for "Open File Location"
        const finalResults = await Promise.all((results || []).map(async (node) => {
            let pathTokens: string[] = [];
            let currentParentId = node.parent_id;

            // Safety depth limit
            let depth = 0;
            while (currentParentId && depth < 10) {
                const { data: parent } = await supabase
                    .from('storage_nodes')
                    .select('id, name, parent_id')
                    .eq('id', currentParentId)
                    .single();

                if (parent) {
                    pathTokens.unshift(parent.name);
                    currentParentId = parent.parent_id;
                } else {
                    break;
                }
                depth++;
            }

            return {
                ...node,
                path_tokens: pathTokens
            };
        }));

        return NextResponse.json(finalResults);

    } catch (error: any) {
        console.error("Search Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
