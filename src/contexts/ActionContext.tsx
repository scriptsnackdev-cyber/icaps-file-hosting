'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useActionCache } from '@/hooks/useActionCache';
import { CACHE_KEYS } from '@/constants/cacheKeys';
import { Project } from '@/types';

import { useAuth } from './AuthContext';

interface ActionContextType {
    projects: Project[];
    projectsLoading: boolean;
    refreshProjects: () => Promise<void>;
}

const ActionContext = createContext<ActionContextType | undefined>(undefined);

export function ActionProvider({ children }: { children: React.ReactNode }) {
    const { userId, loading: authLoading } = useAuth();

    const fetchProjects = useCallback(async () => {
        if (!userId) {
            console.log('[ActionContext] Skipping fetchProjects: No userId');
            return [];
        }

        console.log('[ActionContext] Fetching projects for userId:', userId);
        try {
            const res = await fetch('/api/projects');
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Failed to fetch projects: ${res.status} ${text}`);
            }
            const data = await res.json();
            console.log('[ActionContext] Projects fetched:', data.length);
            return data;
        } catch (error) {
            console.error('[ActionContext] Error fetching projects:', error);
            throw error;
        }
    }, [userId]);

    const {
        data: projects,
        loading: projectsLoading,
        refresh: refreshProjects
    } = useActionCache<Project[]>(CACHE_KEYS.PROJECTS, fetchProjects, {
        initialData: [],
        enabled: !!userId
    });

    const isInitializing = authLoading || (!!userId && !projects && projectsLoading === false);

    return (
        <ActionContext.Provider value={{
            projects: projects || [],
            projectsLoading: projectsLoading || isInitializing,
            refreshProjects: async () => { await refreshProjects(false); }
        }}>
            {children}
        </ActionContext.Provider>
    );
}

export function useActionContext() {
    const context = useContext(ActionContext);
    if (context === undefined) {
        throw new Error('useActionContext must be used within an ActionProvider');
    }
    return context;
}
