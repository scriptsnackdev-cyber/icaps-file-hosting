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

        // 2. Perform Search with Path Resolution in one query
        // We use a raw-ish select to include our custom function result
        const { data: results, error } = await supabase
            .from('storage_nodes')
            .select(`
                id, 
                name, 
                type, 
                parent_id, 
                updated_at, 
                size, 
                owner_email,
                path_tokens:resolve_node_path(id)
            `)
            .eq('project_id', resolvedProjectId)
            .ilike('name', `%${query}%`)
            .neq('status', 'DELETED_PENDING')
            .neq('status', 'TRASHED') // Also exclude trashed from main search
            .limit(20);

        if (error) {
            console.error("Search query error:", error);
            // Fallback: If function doesn't exist yet, retry without it
            const { data: fallbackResults, error: fallbackError } = await supabase
                .from('storage_nodes')
                .select('id, name, type, parent_id, updated_at, size, owner_email')
                .eq('project_id', resolvedProjectId)
                .ilike('name', `%${query}%`)
                .neq('status', 'DELETED_PENDING')
                .neq('status', 'TRASHED')
                .limit(20);

            if (fallbackError) throw fallbackError;
            return NextResponse.json(fallbackResults || []);
        }

        return NextResponse.json(results || []);

    } catch (error: any) {
        console.error("Search Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
