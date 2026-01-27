'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface AuthContextType {
    isAdmin: boolean;
    userEmail: string | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initial load from localStorage for instant UI
        const cachedAdmin = localStorage.getItem('auth_is_admin');
        const cachedEmail = localStorage.getItem('auth_user_email');
        if (cachedAdmin === 'true') setIsAdmin(true);
        if (cachedEmail) setUserEmail(cachedEmail);

        const checkAuth = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                setUserEmail(user.email || null);
                localStorage.setItem('auth_user_email', user.email || '');

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
                localStorage.removeItem('auth_is_admin');
                localStorage.removeItem('auth_user_email');
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

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
        <AuthContext.Provider value={{ isAdmin, userEmail, loading, signOut }}>
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
