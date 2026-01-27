import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data: whitelist, error } = await supabase
            .from('whitelist')
            .select('*')
            .order('email');

        if (error) throw error;

        return NextResponse.json(whitelist);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Admin
    const { data: whitelistUser } = await supabase
        .from('whitelist')
        .select('role')
        .eq('email', user.email)
        .single();

    if (whitelistUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    try {
        const { data, error } = await supabase
            .from('whitelist')
            .insert({ email, role: role || 'user' })
            .select()
            .single();

        if (error) {
            // Already exists logic or error
            if (error.code === '23505') return NextResponse.json({ error: 'User already whitelisted' }, { status: 409 });
            throw error;
        }

        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Admin
    const { data: whitelistUser } = await supabase
        .from('whitelist')
        .select('role')
        .eq('email', user.email)
        .single();

    if (whitelistUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    if (email.toLowerCase() === user.email?.toLowerCase()) {
        return NextResponse.json({ error: 'Cannot remove yourself from whitelist' }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .from('whitelist')
            .delete()
            .eq('email', email)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return NextResponse.json({ error: 'User not found or permission denied' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
