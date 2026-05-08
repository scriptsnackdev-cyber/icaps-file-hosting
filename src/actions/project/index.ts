'use server';

import { createClient, createServiceClient } from '@/utils/supabase/server';
import { hasValidSupabaseEnv } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { r2Client, R2_BUCKET, hasValidR2Env } from '@/lib/r2';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';

export async function fetchUserProjects(): Promise<{ id: string; name: string; userRole: string | null }[]> {
    if (!hasValidSupabaseEnv) return [{ id: 'mock', name: 'Mock Project', userRole: 'admin' }];
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return [];

    // 1. Get global role
    let globalRole = 'user';
    if (user.email) {
        const serviceClient = createServiceClient();
        const { data: whitelistData } = await serviceClient
            .from('share_whitelist')
            .select('role')
            .ilike('email', user.email.trim())
            .maybeSingle();
        if (whitelistData) globalRole = whitelistData.role;
    }

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
        userRole: globalRole === 'admin' ? 'admin' : ((roleMap.get(p.id) as string | null) ?? null)
    }));
}

export async function fetchUserProjectsWithUsage(): Promise<{
    id: string;
    name: string;
    userRole: string | null;
    totalBytes: number;
}[]> {
    if (!hasValidSupabaseEnv) return [{
        id: 'mock', name: 'Mock Project', userRole: 'admin', totalBytes: 123456789
    }];
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return [];

    // 1. Get global role
    let globalRole = 'user';
    if (user.email) {
        const serviceClient = createServiceClient();
        const { data: whitelistData } = await serviceClient
            .from('share_whitelist')
            .select('role')
            .ilike('email', user.email.trim())
            .maybeSingle();
        if (whitelistData) globalRole = whitelistData.role;
    }

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

    const projects = projectsRes.data || [];
    const roleMap = new Map((membersRes.data || []).map((m: { project_id: string; role: string }) => [m.project_id, m.role]));

    // Fetch usage for all projects if admin, otherwise only for members
    const projectIdsToFetchUsage = globalRole === 'admin' 
        ? projects.map(p => p.id)
        : projects.filter(p => roleMap.has(p.id)).map(p => p.id);

    let usageMap = new Map<string, number>();
    if (projectIdsToFetchUsage.length > 0) {
        const { data: usageData, error: usageError } = await supabaseServer.rpc('get_project_usages', {
            p_project_ids: projectIdsToFetchUsage,
        });
        if (!usageError && usageData) {
            for (const row of usageData as { project_id: string; total_bytes: number }[]) {
                usageMap.set(row.project_id, Number(row.total_bytes));
            }
        }
    }

    return projects.map(p => ({
        id: p.id,
        name: p.name,
        userRole: globalRole === 'admin' ? 'admin' : ((roleMap.get(p.id) as string | null) ?? null),
        totalBytes: usageMap.get(p.id) ?? 0,
    }));
}

export async function fetchProject(projectId: string) {
    if (!hasValidSupabaseEnv) return { id: 'mock', name: 'Mock Project' };
    const { data, error } = await (await createClient()).from('share_projects')
        .select('id, name')
        .eq('id', projectId)
        .single();

    if (error) {
        console.error('Error fetching project:', error);
        return null;
    }
    return data;
}

export async function renameProject(projectId: string, newName: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const { error } = await (await createClient()).from('share_projects').update({ name: newName }).eq('id', projectId);
    if (error) throw new Error(error.message);
    revalidatePath('/');
    return { success: true };
}


export async function deleteProject(projectId: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const supabaseServer = await createClient();
    const serviceClient = createServiceClient();

    // 1. Find all file keys in this project
    const { data: projectFiles } = await serviceClient
        .from('share_nodes')
        .select('r2_key')
        .eq('project_id', projectId)
        .eq('type', 'file')
        .not('r2_key', 'is', null);

    const keysToDelete = (projectFiles || []).map(f => f.r2_key).filter(Boolean) as string[];

    // 2. Batch Delete from R2
    if (keysToDelete.length > 0 && hasValidR2Env) {
        try {
            for (let i = 0; i < keysToDelete.length; i += 1000) {
                const batch = keysToDelete.slice(i, i + 1000);
                await r2Client.send(new DeleteObjectsCommand({
                    Bucket: R2_BUCKET,
                    Delete: { Objects: batch.map(k => ({ Key: k })) }
                }));
            }
        } catch (e) {
            console.error('Batch project delete from R2 failed', e);
        }
    }

    // 3. Delete project (cascades)
    const { error } = await supabaseServer.from('share_projects').delete().eq('id', projectId);
    if (error) throw new Error(error.message);
    
    revalidatePath('/');
    return { success: true };
}

export async function createProject(name: string, description: string) {
    if (!hasValidSupabaseEnv) return { success: true, id: 'mock' };
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { data, error } = await (await createClient()).from('share_projects').insert([{
        name,
        description,
        created_by: user.id
    }]).select('id').single();

    if (error) throw new Error(error.message);

    if (user.email) {
        await (await createClient()).from('share_project_members').insert([{
            project_id: data.id,
            email: user.email,
            role: 'admin',
            created_by: user.id
        }]);
    }

    revalidatePath('/');
    return { success: true, id: data.id };
}

export async function getProjectMembers(projectId: string) {
    if (!hasValidSupabaseEnv) return [];
    const { data, error } = await (await createClient()).from('share_project_members')
        .select('*')
        .eq('project_id', projectId);

    if (error) {
        console.error('Error fetching members:', error);
        return [];
    }
    return data;
}

export async function addProjectMember(projectId: string, email: string, role: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { error } = await (await createClient()).from('share_project_members').insert([{
        project_id: projectId,
        email,
        role,
        created_by: user.id
    }]);

    if (error) throw new Error(error.message);
    return { success: true };
}

export async function updateProjectMemberRole(projectId: string, email: string, role: 'admin' | 'member' | 'read_only') {
    if (!hasValidSupabaseEnv) return { success: true };
    const { error } = await (await createClient()).from('share_project_members')
        .update({ role })
        .eq('project_id', projectId)
        .eq('email', email);

    if (error) throw new Error(error.message);
    return { success: true };
}

export async function removeProjectMember(projectId: string, email: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const { error } = await (await createClient()).from('share_project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('email', email);

    if (error) throw new Error(error.message);
    return { success: true };
}

export async function getMyRoleInProject(projectId: string) {
    if (!hasValidSupabaseEnv) return 'admin';
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user || !user.email) return 'read_only';

    const { data, error } = await supabaseServer
        .from('share_project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('email', user.email)
        .maybeSingle();

    if (error || !data) {
        // If not a member, check if global admin
        const serviceClient = createServiceClient();
        const { data: roleData } = await serviceClient
            .from('share_whitelist')
            .select('role')
            .ilike('email', user.email)
            .maybeSingle();

        if (roleData?.role === 'admin') return 'admin';
        return 'read_only';
    }

    return data.role;
}
