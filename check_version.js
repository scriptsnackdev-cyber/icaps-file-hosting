const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
    console.log('Checking storage_nodes structure...');
    // We can't easily run ALTER TABLE via JS SDK without an RPC.
    // I'll try to check if it exists by querying a dummy version.
    const { data, error } = await supabase.from('storage_nodes').select('version').limit(1);

    if (error && error.message.includes('column "version" does not exist')) {
        console.log('CRITICAL: Column "version" is missing.');
        console.log('Please run this SQL in your Supabase Dashboard:');
        console.log('ALTER TABLE storage_nodes ADD COLUMN version INTEGER DEFAULT 1;');
    } else if (error) {
        console.error('Error checking column:', error.message);
    } else {
        console.log('Column "version" already exists or no error.');
    }
}

migrate();
