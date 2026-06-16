'use server'

import { createClient, createServiceClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function sendOTP(formData: FormData) {
    const email = formData.get('email') as string
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    // 1. Check if email is in whitelist
    const { data: whitelistData, error: whitelistError } = await serviceClient
        .from('share_whitelist')
        .select('email, role')
        .eq('email', email)
        .single()

    if (whitelistError || !whitelistData) {
        return { error: 'Access denied. Your email is not whitelisted.' }
    }

    // 2. If whitelisted, send OTP
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true, // Will be checked by Postgres trigger but allows creating if first time
        },
    })

    if (error) {
        return { error: error.message }
    }

    return { success: true, email }
}

export async function verifyOTP(formData: FormData) {
    const email = formData.get('email') as string
    const token = formData.get('token') as string
    const supabase = await createClient()

    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
    })

    if (error) {
        return { error: error.message }
    }

    redirect('/')
}

export async function signOut() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
}
