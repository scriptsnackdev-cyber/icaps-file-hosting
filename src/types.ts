export interface StorageNode {
    id: string;
    parent_id: string | null;
    project_id?: string; // New: All nodes belong to a project! (Root folders of project have parent_id=null but valid project_id)
    name: string;
    type: 'FILE' | 'FOLDER';
    r2_key?: string;
    size?: number;
    mime_type?: string;
    created_at: string;
    updated_at: string;
    owner_email?: string;
    sharing_scope: 'PRIVATE' | 'PUBLIC_READ' | 'PUBLIC_EDIT';
    version: number;
    status?: 'ACTIVE' | 'TRASHED' | 'DELETED_PENDING';
    trashed_at?: string;
}

export type Permission = 'VIEW' | 'EDIT';

export interface Project {
    id: string;
    name: string;
    description?: string;
    max_storage_bytes: number;
    current_storage_bytes: number;
    created_at: string;
    created_by: string;
    members?: string[]; // Array of emails for convenience
    settings?: {
        notify_on_activity?: boolean;
        version_retention_limit?: number;
        read_only?: boolean;
    };
}

export interface WhitelistUser {
    email: string;
    description?: string;
    role: 'admin' | 'user';
}
