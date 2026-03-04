require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function check() {
    console.log("Checking whitelist for nansk136@outlook.co.th...");
    const { data, error } = await supabase
        .from('share_whitelist')
        .select('email, role')
        .eq('email', 'nansk136@outlook.co.th')
        .single();

    console.log(JSON.stringify({ data, error }, null, 2));
}

check();
