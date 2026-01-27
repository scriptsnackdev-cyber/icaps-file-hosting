import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data, error } = await supabase
            .from('storage_nodes')
            .select('size')
            .eq('type', 'FILE');

        if (error) throw error;

        const totalSize = data.reduce((acc, curr) => acc + (curr.size || 0), 0);

        return NextResponse.json({ totalSize });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
