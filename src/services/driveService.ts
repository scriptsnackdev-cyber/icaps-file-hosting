import { SupabaseClient } from '@supabase/supabase-js';
import { StorageNode } from '@/types';

export const driveService = {
    async fetchNodes(supabase: SupabaseClient, projectId: string, parentId: string | null = null) {
        let query = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', projectId)
            .or('status.eq.ACTIVE,status.is.null');

        if (parentId) {
            query = query.eq('parent_id', parentId);
        } else {
            query = query.is('parent_id', null);
        }

        const { data, error } = await query
            .order('type', { ascending: false })
            .order('name', { ascending: true });

        if (error) throw error;
        return data as StorageNode[];
    },

    async deleteNode(supabase: SupabaseClient, nodeId: string) {
        const { error } = await supabase
            .from('storage_nodes')
            .update({ status: 'TRASHED', trashed_at: new Date().toISOString() })
            .eq('id', nodeId);

        if (error) throw error;
    },

    async renameNode(supabase: SupabaseClient, nodeId: string, newName: string) {
        const { error } = await supabase
            .from('storage_nodes')
            .update({ name: newName, updated_at: new Date().toISOString() })
            .eq('id', nodeId);

        if (error) throw error;
    },

    async moveNode(supabase: SupabaseClient, nodeId: string, newParentId: string | null) {
        const { error } = await supabase
            .from('storage_nodes')
            .update({ parent_id: newParentId, updated_at: new Date().toISOString() })
            .eq('id', nodeId);

        if (error) throw error;
    },

    async createFolder(supabase: SupabaseClient, projectId: string, parentId: string | null, name: string, userId: string) {
        const { data, error } = await supabase
            .from('storage_nodes')
            .insert({
                project_id: projectId,
                parent_id: parentId,
                name: name,
                type: 'FOLDER',
                created_by: userId,
                owner_email: (await supabase.auth.getUser()).data.user?.email || null
            })
            .select()
            .single();

        if (error) throw error;
        return data as StorageNode;
    },

    async fetchVersions(supabase: SupabaseClient, nodeId: string) {
        const { data, error } = await supabase
            .from('storage_nodes')
            .select('*')
            .eq('id', nodeId) // Ideally we'd have a versions table or use history
            // For now, based on existing API, we fetch from a dedicated route but let's assume we can query history
            .order('version', { ascending: false });

        if (error) throw error;
        return data as StorageNode[];
    }
};
