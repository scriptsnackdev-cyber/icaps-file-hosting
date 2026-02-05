'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useActionCache } from '@/hooks/useActionCache';
import { CACHE_KEYS } from '@/constants/cacheKeys';
import { Project } from '@/types';

interface ActionContextType {
    projects: Project[];
    projectsLoading: boolean;
    refreshProjects: () => Promise<void>;
}

const ActionContext = createContext<ActionContextType | undefined>(undefined);

export function ActionProvider({ children }: { children: React.ReactNode }) {

    const fetchProjects = useCallback(async () => {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to fetch projects');
        return await res.json();
    }, []);

    const {
        data: projects,
        loading: projectsLoading,
        refresh: refreshProjects
    } = useActionCache<Project[]>(CACHE_KEYS.PROJECTS, fetchProjects, {
        initialData: []
    });

    return (
        <ActionContext.Provider value={{
            projects: projects || [],
            projectsLoading,
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
