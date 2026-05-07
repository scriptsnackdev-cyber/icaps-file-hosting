'use server';

import { createClient } from '@/utils/supabase/server';
import { hasValidSupabaseEnv } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

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
