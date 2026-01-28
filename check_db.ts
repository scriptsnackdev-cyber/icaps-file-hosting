import { supabaseAdmin } from './src/lib/supabase-admin';

async function checkSchema() {
    const { data, error } = await supabaseAdmin
        .from('storage_nodes')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching node:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('Table is empty, trying to get columns from information_schema');
        const { data: cols, error: colError } = await supabaseAdmin.rpc('get_table_columns', { table_name: 'storage_nodes' });
        if (colError) {
            // If RPC doesn't exist, try a raw query if possible via a clever way or just assume we need to add version.
            console.log('RPC failed, might need to add version column.');
        } else {
            console.log('Cols from RPC:', cols);
        }
    }
}

checkSchema();
