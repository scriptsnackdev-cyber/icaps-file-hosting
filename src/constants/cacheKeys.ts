export const CACHE_KEYS = {
    AUTH_USER: 'auth_user',
    AUTH_ADMIN: 'auth_admin_status',
    AUTH_EMAIL: 'auth_user_email',
    AUTH_ID: 'auth_user_id',
    PROJECTS: 'global_projects',
    STORAGE_STATS: 'storage_stats',
    // Dynamic keys generator
    NODES: (projectId: string, path: string) => `nodes_${projectId}_${path}`,
    PROJECT_DETAILS: (projectId: string) => `project_${projectId}`,
    RECENT_FILES: 'recent_files'
};
