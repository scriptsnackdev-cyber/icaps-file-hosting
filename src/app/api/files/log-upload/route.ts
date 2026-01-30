
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function checkAuth() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { user: null, isWhitelisted: false };

    const { data: whitelistData } = await supabase
        .from('whitelist')
        .select('email')
        .eq('email', user.email)
        .single();

    return { user, isWhitelisted: !!whitelistData };
}

export async function POST(request: NextRequest) {
    try {
        const { filename } = await request.json();

        // AUTH CHECK
        const { user, isWhitelisted } = await checkAuth();
        if (!user || !isWhitelisted) {
            // Silently fail or return error, but for logging we can be strict
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const email = user.email!;

        await supabaseAdmin.from('access_logs').insert({
            user_email: email,
            action: 'UPLOAD',
            file_key: filename,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error logging upload:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
