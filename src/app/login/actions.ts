'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';

export async function ensureUserExists(email: string) {
    if (!email) return { error: 'Email is required' };

    try {
        // 1. Check if user already exists
        const { data: { users }, error: fetchError } = await supabaseAdmin.auth.admin.listUsers();

        if (fetchError) {
            console.error('Error fetching users:', fetchError);
            // Don't fail the flow, just try to sign in normally
            return { success: false, error: fetchError.message };
        }

        // We need to filter manually because listUsers doesn't support filtering by email in all versions/wrappers
        // or to be safe. Actually, listUsers pagination might miss it if we have many users.
        // Better approach: Try to getUserByEmail directly if available, or just create and catch error.

        // However, admin.createUser will return error if user exists.
        // So we can arguably just try to create.

        const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            email_confirm: true, // Confirm the email immediately
            user_metadata: {
                confirmed_by_admin: true
            }
        });

        if (createError) {
            // User already exists or other error
            if (createError.message.includes('already has been registered') || createError.status === 422) {
                // User exists, which is what we want.
                return { success: true, message: 'User already exists' };
            }
            console.error('Error creating user:', createError);
            return { success: false, error: createError.message };
        }

        // User created successfully
        return { success: true, message: 'User created and confirmed' };

    } catch (e: any) {
        console.error('Unexpected error in ensureUserExists:', e);
        return { success: false, error: e.message };
    }
}
