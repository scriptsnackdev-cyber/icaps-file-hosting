'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface AuthContextType {
    isAdmin: boolean;
    userEmail: string | null;
    userId: string | null;
    loading: boolean;
    signOut: () => Promise<void>;
    refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = useCallback(async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            setUserEmail(user.email || null);
            setUserId(user.id);
            localStorage.setItem('auth_user_email', user.email || '');
            localStorage.setItem('auth_user_id', user.id);

            const { data } = await supabase
                .from('whitelist')
                .select('role')
                .eq('email', user.email)
                .single();

            const adminStatus = data?.role === 'admin';
            setIsAdmin(adminStatus);
            localStorage.setItem('auth_is_admin', adminStatus.toString());
        } else {
            setIsAdmin(false);
            setUserEmail(null);
            setUserId(null);
            localStorage.removeItem('auth_is_admin');
            localStorage.removeItem('auth_user_email');
            localStorage.removeItem('auth_user_id');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        // Initial load from localStorage for instant UI
        if (typeof window !== 'undefined') {
            const cachedAdmin = localStorage.getItem('auth_is_admin');
            const cachedEmail = localStorage.getItem('auth_user_email');
            const cachedId = localStorage.getItem('auth_user_id');
            if (cachedAdmin === 'true') setIsAdmin(true);
            if (cachedEmail) setUserEmail(cachedEmail);
            if (cachedId) setUserId(cachedId);
        }

        // Initial fetch
        checkAuth();

        // Subscribe to changes
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                // We could just set state from session here, but checkAuth does the extra whitelist logic.
                // So we call checkAuth to be safe and get Role.
                await checkAuth();
            } else if (event === 'SIGNED_OUT') {
                setIsAdmin(false);
                setUserEmail(null);
                setUserId(null);
                setLoading(false);
                localStorage.removeItem('auth_is_admin');
                localStorage.removeItem('auth_user_email');
                localStorage.removeItem('auth_user_id');
                // Optional: Redirect if needed, but Page usually handles redirect on !user
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [checkAuth]);

    const signOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        setIsAdmin(false);
        setUserEmail(null);
        localStorage.removeItem('auth_is_admin');
        localStorage.removeItem('auth_user_email');
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ isAdmin, userEmail, userId, loading, signOut, refreshAuth: checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
