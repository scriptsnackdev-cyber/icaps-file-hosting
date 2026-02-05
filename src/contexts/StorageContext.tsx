'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useActionCache } from '@/hooks/useActionCache';
import { CACHE_KEYS } from '@/constants/cacheKeys';

import { useAuth } from './AuthContext';

interface StorageContextType {
    totalSize: number;
    refreshStorage: () => Promise<void>;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export function StorageProvider({ children }: { children: React.ReactNode }) {
    const { userId } = useAuth();

    const fetchStorage = useCallback(async () => {
        if (!userId) return 0;
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (typeof data.totalSize !== 'number') throw new Error('Invalid storage data');
        return data.totalSize as number;
    }, [userId]);

    const { data: totalSize, refresh: refreshStorage } = useActionCache<number>(
        CACHE_KEYS.STORAGE_STATS,
        fetchStorage,
        {
            initialData: 0,
            enabled: !!userId
        }
    );

    return (
        <StorageContext.Provider value={{ totalSize: totalSize || 0, refreshStorage: async () => { await refreshStorage(false); } }}>
            {children}
        </StorageContext.Provider>
    );
}

export function useStorage() {
    const context = useContext(StorageContext);
    if (context === undefined) {
        throw new Error('useStorage must be used within a StorageProvider');
    }
    return context;
}
