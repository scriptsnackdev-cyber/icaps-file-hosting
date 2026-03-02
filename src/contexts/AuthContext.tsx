'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { CACHE_KEYS } from '@/constants/cacheKeys';

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
        try {
            const supabase = createClient();
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (authError || !user) {
                setIsAdmin(false);
                setUserEmail(null);
                setUserId(null);
                localStorage.removeItem(CACHE_KEYS.AUTH_ADMIN);
                localStorage.removeItem(CACHE_KEYS.AUTH_EMAIL);
                localStorage.removeItem(CACHE_KEYS.AUTH_ID);
                setLoading(false);
                return;
            }

            setUserEmail(user.email || null);
            setUserId(user.id);
            localStorage.setItem(CACHE_KEYS.AUTH_EMAIL, user.email || '');
            localStorage.setItem(CACHE_KEYS.AUTH_ID, user.id);

            try {
                const { data, error } = await supabase
                    .from('whitelist')
                    .select('role')
                    .eq('email', user.email)
                    .maybeSingle();

                if (error) {
                    console.warn('[AuthContext] Error fetching whitelist:', error.message);
                }

                const adminStatus = data?.role === 'admin';
                setIsAdmin(adminStatus);
                localStorage.setItem(CACHE_KEYS.AUTH_ADMIN, adminStatus.toString());
            } catch (err) {
                console.warn('[AuthContext] Failed to query whitelist:', err);
                setIsAdmin(false);
                localStorage.setItem(CACHE_KEYS.AUTH_ADMIN, 'false');
            }
        } catch (error) {
            console.error('[AuthContext] Unexpected error during checkAuth:', error);
            // Don't necessarily clear user if it's a transient network error, 
            // but we ensure loading is set to false.
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Initial load from localStorage for instant UI
        if (typeof window !== 'undefined') {
            const cachedAdmin = localStorage.getItem(CACHE_KEYS.AUTH_ADMIN);
            const cachedEmail = localStorage.getItem(CACHE_KEYS.AUTH_EMAIL);
            const cachedId = localStorage.getItem(CACHE_KEYS.AUTH_ID);
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
                localStorage.removeItem(CACHE_KEYS.AUTH_ADMIN);
                localStorage.removeItem(CACHE_KEYS.AUTH_EMAIL);
                localStorage.removeItem(CACHE_KEYS.AUTH_ID);
                // Optional: Redirect if needed, but Page usually handles redirect on !user
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [checkAuth]);

    const signOut = async () => {
        try {
            console.log("Signing out...");
            setLoading(true);
            const supabase = createClient();

            // Force timeout 2s
            await Promise.race([
                supabase.auth.signOut(),
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);

            console.log("Sign out completed (or timed out)");
        } catch (error) {
            console.error("Error signing out:", error);
        } finally {
            console.log("Clearing state and redirecting...");
            setIsAdmin(false);
            setUserEmail(null);
            setUserId(null);
            localStorage.clear(); // Clear all app state

            // Force hard redirect
            window.location.href = '/login';
        }
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
