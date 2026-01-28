import { supabaseAdmin } from './src/lib/supabase-admin';

async function migrate() {
    console.log('Starting migration: Adding version column to storage_nodes...');
    const { error } = await supabaseAdmin.rpc('exec_sql', {
        sql: 'ALTER TABLE storage_nodes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;'
    });

    if (error) {
        console.error('Migration failed (RPC exec_sql might not exist):', error);
        console.log('Attempting to use direct query if possible...');
        // Supabase JS SDK doesn't support raw SQL easily unless RPC is defined.
        // I'll try to at least check if the column is missing and report.
    } else {
        console.log('Migration successful!');
    }
}

migrate();
