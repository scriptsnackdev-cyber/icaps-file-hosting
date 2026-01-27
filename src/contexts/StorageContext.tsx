'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface StorageContextType {
    totalSize: number;
    refreshStorage: () => Promise<void>;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export function StorageProvider({ children }: { children: React.ReactNode }) {
    const [totalSize, setTotalSize] = useState<number>(0);

    // Initial load from localStorage to avoid flicker
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('storage_total_size');
            if (saved) {
                setTotalSize(parseInt(saved, 10));
            }
        }
        // Then fetch fresh data immediately
        refreshStorage();
    }, []);

    const refreshStorage = useCallback(async () => {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            if (typeof data.totalSize === 'number') {
                setTotalSize(data.totalSize);
                if (typeof window !== 'undefined') {
                    localStorage.setItem('storage_total_size', data.totalSize.toString());
                }
            }
        } catch (error) {
            console.error('Failed to fetch storage stats:', error);
        }
    }, []);

    return (
        <StorageContext.Provider value={{ totalSize, refreshStorage }}>
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
