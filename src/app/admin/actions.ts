'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getWhitelist() {
    const supabase = await createClient()
    const { data, error } = await supabase.from('share_whitelist').select('*').order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching whitelist:', error)
        return []
    }
    return data
}

export async function addWhitelistUser(formData: FormData) {
    const email = formData.get('email') as string
    const role = formData.get('role') as string
    const supabase = await createClient()

    // Must ensure I am admin. RLS does this, but UI safety matters.
    const { error } = await supabase.from('share_whitelist').insert([{ email, role }])

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/admin')
    return { success: true }
}

export async function removeWhitelistUser(email: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('share_whitelist').delete().eq('email', email)

    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
}
