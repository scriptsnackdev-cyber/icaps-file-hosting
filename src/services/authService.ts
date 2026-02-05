import { SupabaseClient } from '@supabase/supabase-js';

export const authService = {
    async getProfile(supabase: SupabaseClient, email: string) {
        const { data, error } = await supabase
            .from('whitelist')
            .select('role')
            .eq('email', email)
            .single();

        if (error) return null;
        return data;
    }
};
