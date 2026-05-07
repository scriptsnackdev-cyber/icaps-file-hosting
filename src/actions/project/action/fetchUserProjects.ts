'use server';

import { createClient } from '@/utils/supabase/server';
import { hasValidSupabaseEnv } from '@/lib/supabase';

export async function fetchUserProjects(): Promise<{ id: string; name: string; userRole: string | null }[]> {
    if (!hasValidSupabaseEnv) return [{ id: 'mock', name: 'Mock Project', userRole: 'admin' }];
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return [];

    const [projectsRes, membersRes] = await Promise.all([
        supabaseServer.from('share_projects').select('id, name').order('name'),
        user.email
            ? supabaseServer.from('share_project_members').select('project_id, role').eq('email', user.email)
            : Promise.resolve({ data: [] as { project_id: string; role: string }[] })
    ]);

    if (projectsRes.error) {
        console.error('Error fetching projects:', projectsRes.error);
        return [];
    }

    const roleMap = new Map((membersRes.data || []).map((m: { project_id: string; role: string }) => [m.project_id, m.role]));

    return (projectsRes.data || []).map(p => ({
        id: p.id,
        name: p.name,
        userRole: (roleMap.get(p.id) as string | null) ?? null
    }));
}
