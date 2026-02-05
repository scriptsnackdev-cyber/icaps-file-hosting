export const CACHE_KEYS = {
    PROJECTS: 'global_projects',
    STORAGE_STATS: 'storage_stats',
    AUTH_ADMIN: 'auth_is_admin',
    AUTH_EMAIL: 'auth_user_email',
    AUTH_ID: 'auth_user_id',

    // Dynamic keys
    PROJECT_DETAILS: (id: string) => `cache_project_${id}`,
    NODES: (projectId: string, pathKey: string) => `cache_nodes_${projectId}_${pathKey}`,
};
