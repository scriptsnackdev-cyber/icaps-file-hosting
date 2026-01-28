'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import {
    Cloud, Search, Plus, Loader2, FolderPlus, FileUp, Home as HomeIcon,
    ChevronRight, Copy, Share2, Download, Trash2, FileText, Folder,
    Settings, MoreVertical, Upload, FolderUp, Lock, Globe, Users, X, Check,
    AlertCircle, ArrowUpCircle, RotateCcw, History
} from 'lucide-react';
import { StorageNode, Project } from '@/types';
import { createClient } from '@/utils/supabase/client';
import { format } from 'date-fns';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { TaskProgress, AsyncTask } from '@/components/TaskProgress';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/contexts/ToastContext';
import { useStorage } from '@/contexts/StorageContext';

import { useAuth } from '@/contexts/AuthContext';

export default function DrivePage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string[] | undefined;
    const { showToast } = useToast();
    const { refreshStorage } = useStorage();
    const { isAdmin, userEmail } = useAuth();

    // Project structure: /drive/[projectId]/[...folders]
    const slugKey = slug?.join('/') || '';
    const urlProjectId = slug?.[0];
    const folderPath = React.useMemo(() => slug?.slice(1) || [], [slugKey]); // Use slugKey for stability
    const folderPathKey = folderPath.join('/');

    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    const [nodes, setNodes] = useState<StorageNode[]>([]);

    // Hydrate from localStorage
    useEffect(() => {
        const savedProjects = localStorage.getItem('cache_projects');
        if (savedProjects) {
            try {
                setProjects(JSON.parse(savedProjects));
            } catch (e) {
                console.error('Failed to parse cached projects', e);
            }
        }
    }, []);

    useEffect(() => {
        const savedProject = localStorage.getItem(`cache_project_${urlProjectId}`);
        if (savedProject) {
            try {
                setCurrentProject(JSON.parse(savedProject));
            } catch (e) {
                console.error('Failed to parse cached project', e);
            }
        }

        const savedNodes = localStorage.getItem(`cache_nodes_${urlProjectId}_${folderPathKey}`);
        if (savedNodes) {
            try {
                setNodes(JSON.parse(savedNodes));
            } catch (e) {
                console.error('Failed to parse cached nodes', e);
            }
        }
    }, [urlProjectId, folderPathKey]);
    const [loading, setLoading] = useState(true);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [folderChain, setFolderChain] = useState<{ id: string, name: string }[]>([]);
    const [tasks, setTasks] = useState<AsyncTask[]>([]);
    const [dragActive, setDragActive] = useState(false);

    // Inputs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // New Folder UI State
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("New Folder");
    const newFolderInputRef = useRef<HTMLInputElement>(null);

    // Upload Menu State
    const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Folder Upload Prep State
    const [isFolderUploadModalOpen, setIsFolderUploadModalOpen] = useState(false);
    const [pendingFolderUpload, setPendingFolderUpload] = useState<File[] | null>(null);
    const [pendingFolderStats, setPendingFolderStats] = useState<{ count: number, size: string }>({ count: 0, size: '0 MB' });

    // Project Creation State
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [newProjectQuota, setNewProjectQuota] = useState(100); // GB
    const [newProjectMembers, setNewProjectMembers] = useState<string[]>([]);
    const [whitelist, setWhitelist] = useState<string[]>([]);
    const [conflictInfo, setConflictInfo] = useState<{
        file: File,
        parentId: string | null,
        taskId?: string,
        data: any
    } | null>(null);
    const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
    const [versionNodes, setVersionNodes] = useState<StorageNode[]>([]);
    const [selectedHistoryNode, setSelectedHistoryNode] = useState<StorageNode | null>(null);
    const [isRollingBack, setIsRollingBack] = useState(false);
    const [pendingRollback, setPendingRollback] = useState<StorageNode | null>(null);

    // Share Modal State
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareConfig, setShareConfig] = useState<{
        scope: 'PRIVATE' | 'PUBLIC';
        passwordEnabled: boolean;
        password: string;
    }>({ scope: 'PRIVATE', passwordEnabled: false, password: '' });
    const [isSavingShare, setIsSavingShare] = useState(false);
    const [shareNodeId, setShareNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: StorageNode } | null>(null);

    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadCurrentFolder = () => {
        if (!currentFolderId) return;
        setIsDownloading(true);
        window.location.href = `/api/drive/zip?folderId=${currentFolderId}`;
        setTimeout(() => setIsDownloading(false), 2000);
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, node: StorageNode) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent triggering row click
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    };

    const [draggedNode, setDraggedNode] = useState<StorageNode | null>(null);
    const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);

    const handleMoveNode = async (sourceNode: StorageNode, targetFolderId: string) => {
        if (sourceNode.id === targetFolderId) return; // Cannot move into self

        const toastId = addTask('UPLOAD', `Moving ${sourceNode.name}...`); // Reusing UPLOAD type for generic loading
        try {
            const res = await fetch('/api/drive', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: sourceNode.id,
                    parentId: targetFolderId
                })
            });

            if (!res.ok) throw new Error('Failed to move item');

            updateTask(toastId, 'SUCCESS');
            showToast(`Moved "${sourceNode.name}"`, 'success');
            fetchNodes(); // Refresh list to remove moved item
        } catch (e) {
            console.error(e);
            updateTask(toastId, 'ERROR');
            showToast("Failed to move item", "error");
        }
    };

    const openShareModalForNode = async (nodeId: string) => {
        try {
            const { data, error } = await supabase
                .from('storage_nodes')
                .select('sharing_scope, share_password')
                .eq('id', nodeId)
                .single();

            if (error) throw error;

            setShareNodeId(nodeId);
            setShareConfig({
                scope: (data.sharing_scope as 'PRIVATE' | 'PUBLIC') || 'PRIVATE',
                passwordEnabled: !!data.share_password,
                password: data.share_password || ''
            });
            setIsShareModalOpen(true);

        } catch (e) {
            console.error(e);
            showToast("Failed to fetch share settings", "error");
        }
    };

    useEffect(() => {
        const fetchWhitelist = async () => {
            const { data } = await supabase.from('whitelist').select('email').order('email');
            if (data) setWhitelist(data.map(u => u.email));
        };
        fetchWhitelist();
    }, []);

    const supabase = createClient();

    const fetchProjects = useCallback(async () => {
        try {
            const res = await fetch('/api/projects');
            if (res.ok) {
                const data = await res.json();
                setProjects(data);
                localStorage.setItem('cache_projects', JSON.stringify(data));
            }
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const lastFetchedRef = useRef<string>("");

    const fetchNodes = useCallback(async () => {
        const projectIdToUse = urlProjectId;
        const currentFetchKey = `${projectIdToUse}-${folderPathKey}`;

        if (!projectIdToUse) {
            setLoading(false);
            return;
        }

        // Only fetch if something actually changed or we don't have nodes
        if (lastFetchedRef.current === currentFetchKey && nodes.length > 0 && !loading) {
            return;
        }

        setLoading(true);
        lastFetchedRef.current = currentFetchKey;

        try {
            let url = `/api/drive?project=${encodeURIComponent(projectIdToUse)}`;
            if (folderPath && folderPath.length > 0) {
                const path = folderPath.map(s => encodeURIComponent(s)).join('/');
                url += `&path=${path}`;
            }

            const res = await fetch(url);

            // Safety: If URL changed while we were fetching, ignore this result
            if (lastFetchedRef.current !== currentFetchKey) return;

            if (res.status === 404) {
                showToast('Folder not found', 'error');
                router.push('/drive');
                return;
            }
            if (!res.ok) throw new Error('Failed to load');

            const data = await res.json();
            setNodes(data.nodes || []);
            setCurrentFolderId(data.currentFolderId);
            setFolderChain(data.breadcrumbs || []);

            // Cache current state
            localStorage.setItem(`cache_nodes_${urlProjectId}_${folderPathKey}`, JSON.stringify(data.nodes || []));

            if (data.project) {
                localStorage.setItem(`cache_project_${urlProjectId}`, JSON.stringify(data.project));
                setCurrentProject(prev => {
                    const hasChanged = !prev ||
                        prev.id !== data.project.id ||
                        prev.current_storage_bytes !== data.project.current_storage_bytes ||
                        prev.name !== data.project.name;
                    return hasChanged ? data.project : prev;
                });
            }

        } catch (e) {
            console.error("fetchNodes error:", e);
        } finally {
            // Safety: Only set loading false if this is still the current request
            if (lastFetchedRef.current === currentFetchKey) {
                setLoading(false);
            }
        }
    }, [urlProjectId, folderPathKey, router, showToast, nodes.length, loading]);

    useEffect(() => {
        fetchNodes();
    }, [urlProjectId, folderPathKey, fetchNodes]); // Fetch nodes whenever URL project or path changes

    useEffect(() => {
        if (isCreatingFolder && newFolderInputRef.current) {
            newFolderInputRef.current.focus();
            newFolderInputRef.current.select();
        }
    }, [isCreatingFolder]);

    const handleDeleteProject = async (project: Project) => {
        if (!confirm(`WARNING: Are you sure you want to delete project "${project.name}"? This will PERMANENTLY delete all files and folders in this project. This cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/projects?id=${project.id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast("Project deleted successfully", "success");
                fetchProjects();
                if (currentProject?.id === project.id) {
                    router.push('/drive');
                    setCurrentProject(null);
                }
            } else {
                const err = await res.json();
                showToast(err.error || "Failed to delete project", "error");
            }
        } catch (e) {
            showToast("Error deleting project", "error");
        }
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) {
            showToast("Project name is required", "error");
            return;
        }

        try {
            const membersList = newProjectMembers;
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newProjectName,
                    max_storage_bytes: newProjectQuota * 1024 * 1024 * 1024,
                    members: membersList
                })
            });

            if (res.ok) {
                showToast("Project created successfully!", "success");
                setIsCreatingProject(false);
                setNewProjectName("");
                setNewProjectMembers([]);
                fetchProjects();
            } else {
                const err = await res.json();
                showToast(err.error || "Failed to create project", "error");
            }
        } catch (e) {
            showToast("Error creating project", "error");
        }
    }

    // Task Helpers
    const addTask = (type: 'UPLOAD' | 'DELETE', name: string) => {
        const id = uuidv4();
        const newTask: AsyncTask = { id, type, name, status: 'PENDING' };
        setTasks(prev => [...prev, newTask]);
        return id;
    }

    const updateTask = (id: string, status: 'SUCCESS' | 'ERROR' | 'SKIPPED' | 'CANCELLED') => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    }

    const clearCompletedTasks = () => {
        setTasks(prev => prev.filter(t => t.status === 'PENDING'));
    }

    const handleCreateFolderClick = () => {
        setIsCreatingFolder(true);
        setNewFolderName("New Folder");
    };

    const isSubmittingFolder = useRef(false);

    const confirmCreateFolder = async () => {
        if (!isCreatingFolder || !newFolderName.trim() || isSubmittingFolder.current) {
            setIsCreatingFolder(false);
            return;
        }

        isSubmittingFolder.current = true;
        const nameToCreate = newFolderName;
        setIsCreatingFolder(false);
        setNewFolderName("");

        try {
            const res = await fetch('/api/drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'FOLDER',
                    name: nameToCreate,
                    parentId: currentFolderId,
                    projectId: urlProjectId
                })
            });

            if (res.ok) {
                showToast('Folder created successfully', 'success');
                fetchNodes();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to create folder', 'error');
            }
        } catch (e) {
            showToast('Failed to create folder', 'error');
        } finally {
            isSubmittingFolder.current = false;
        }
    };

    const handleNewFolderKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            confirmCreateFolder();
        } else if (e.key === 'Escape') {
            setIsCreatingFolder(false);
        }
    };

    // Generic Upload Logic
    // Upload & Cancellation
    const abortControllerRef = useRef<AbortController | null>(null);
    const isUploadingRef = useRef(false);

    // Generic Upload Logic
    const uploadFileToId = async (file: File, parentId: string | null, existingTaskId?: string, resolution?: 'update' | 'overwrite') => {
        const cleanName = file.name.split('/').pop()?.split('\\').pop() || file.name;
        const taskId = existingTaskId || addTask('UPLOAD', cleanName);

        const formData = new FormData();
        formData.append('file', file, cleanName);
        if (parentId) formData.append('parentId', parentId);
        if (currentProject) formData.append('projectId', currentProject.id);
        if (resolution) formData.append('resolution', resolution);

        try {
            const signal = abortControllerRef.current?.signal;
            const res = await fetch('/api/drive/upload', {
                method: 'POST',
                body: formData,
                signal
            });

            if (res.status === 409) {
                // Conflict detected
                const data = await res.json();
                setConflictInfo({ file, parentId, taskId, data: data.existing });
                return;
            }

            if (!res.ok) {
                const errorText = await res.text();
                console.error("Upload failed details:", errorText);
                throw new Error(res.statusText || 'Upload failed');
            }

            updateTask(taskId, 'SUCCESS');
            fetchNodes(); // Refresh immediately after success
            refreshStorage(); // Update quota
        } catch (err: any) {
            if (err.name === 'AbortError' || (abortControllerRef.current?.signal.aborted)) {
                updateTask(taskId, 'CANCELLED');
            } else {
                console.error("Upload Error:", err);
                // Show toast only if it's a single file upload to avoid spamming, or use specific error logic
                // For now, let's update task status. TaskProgress shows the error icon.
                updateTask(taskId, 'ERROR');
            }
        }
    };

    const uploadFile = async (file: File) => {
        // Wrapper for current folder
        await uploadFileToId(file, currentFolderId);
    }

    const getOrCreateFolder = async (name: string, parentId: string | null): Promise<string> => {
        const res = await fetch('/api/drive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'FOLDER', name, parentId, projectId: currentProject?.id })
        });
        if (!res.ok) throw new Error("Failed to create folder structure");
        const data = await res.json();
        return data.id;
    }

    const triggerFolderUploadSelection = () => {
        // We open the native picker immediately because browser security requires user gesture
        folderInputRef.current?.click();
    };

    const handleFolderInputCreate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawFiles = e.target.files;
        if (!rawFiles || rawFiles.length === 0) return;

        // Convert FileList to static Array immediately to prevent reference loss when input is cleared
        const files = Array.from(rawFiles);

        // Calculate stats
        const totalSize = files.reduce((acc, file) => acc + file.size, 0);
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2) + ' MB';

        setPendingFolderUpload(files);
        setPendingFolderStats({ count: files.length, size: sizeMB });
        setIsFolderUploadModalOpen(true);

        // Clear input so selecting same folder again works if they cancel
        e.target.value = '';
    }

    // Stop Upload Handler
    const handleStopUpload = () => {
        if (isUploadingRef.current) {
            abortControllerRef.current?.abort();
            isUploadingRef.current = false;
            showToast('Upload stopped by user', 'info');

            // Mark remaining PENDING tasks as CANCELLED visually
            setTasks(prev => prev.map(t => t.status === 'PENDING' ? { ...t, status: 'CANCELLED' } : t));
        }
    };

    const startFolderUpload = async () => {
        if (!pendingFolderUpload) return;
        setIsFolderUploadModalOpen(false);

        const files = pendingFolderUpload;

        // 0. Initialize Cancellation
        abortControllerRef.current = new AbortController();
        isUploadingRef.current = true;

        showToast(`Starting upload of ${files.length} items from folder...`, 'info');

        // 1. PRE-CREATE ALL TASKS
        // This ensures the user sees "Uploading 0/113" immediately
        const newTasks: AsyncTask[] = files.map(file => {
            const cleanName = file.name.split('/').pop()?.split('\\').pop() || file.name;
            return {
                id: uuidv4(),
                type: 'UPLOAD',
                name: cleanName,
                status: 'PENDING'
            };
        });

        const fileTaskIds = newTasks.map(t => t.id);

        setTasks(prev => [...prev, ...newTasks]);

        // Path -> FolderID map
        const folderIdMap = new Map<string, string>();
        if (currentFolderId) folderIdMap.set("", currentFolderId);

        // 1. Build list of all folders needed
        const neededFolders = new Set<string>();
        const filesArray = files; // files is already File[]

        for (const file of filesArray) {
            const path = file.webkitRelativePath; // "Folder/Sub/File.txt"
            const parts = path.split('/');
            parts.pop(); // Remove filename

            // Generate all subpaths: "Folder", "Folder/Sub"
            let currentPath = "";
            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                neededFolders.add(currentPath);
            }
        }

        // 2. Create folders in order of depth (shortest path first)
        const sortedFolders = Array.from(neededFolders).sort((a, b) => a.split('/').length - b.split('/').length);

        try {
            for (const folderPath of sortedFolders) {
                if (!isUploadingRef.current) break; // STOP CHECK

                const parts = folderPath.split('/');
                const folderName = parts[parts.length - 1];
                const parentPath = parts.slice(0, -1).join('/');

                let realParentId: string | null = null;
                if (parentPath === "") {
                    realParentId = currentFolderId;
                } else {
                    realParentId = folderIdMap.get(parentPath) || currentFolderId;
                }

                const newId = await getOrCreateFolder(folderName, realParentId);
                folderIdMap.set(folderPath, newId);
            }

            // 3. Upload Files
            for (let i = 0; i < filesArray.length; i++) {
                if (!isUploadingRef.current) break;

                const file = filesArray[i];
                const taskId = fileTaskIds[i]; // Get pre-created ID

                const path = file.webkitRelativePath;
                const parts = path.split('/');
                parts.pop();
                const dirPath = parts.join('/');

                const targetId = dirPath ? folderIdMap.get(dirPath) : currentFolderId;
                await uploadFileToId(file, targetId || null, taskId);
            }

            fetchNodes();
            refreshStorage();

        } catch (e) {
            console.error(e);
            showToast('Error creating folder structure', 'error');
        } finally {
            isUploadingRef.current = false;
            setPendingFolderUpload(null);
            abortControllerRef.current = null;
        }
    };

    const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await uploadFile(file);
        e.target.value = '';
    };

    // Shared Deletion Logic
    const handleDelete = async (node: StorageNode) => {
        const itemType = node.type === 'FOLDER' ? 'folder' : 'file';
        const warning = node.type === 'FOLDER'
            ? `Are you sure you want to delete folder "${node.name}" and ALL its contents? This cannot be undone.`
            : `Are you sure you want to delete "${node.name}"?`;

        if (!confirm(warning)) return;

        const taskId = addTask('DELETE', node.name);
        try {
            // New Unified Recursive Delete Endpoint
            const res = await fetch(`/api/drive?id=${node.id}&project=${currentProject?.id}`, { method: 'DELETE' });

            if (res.ok) {
                updateTask(taskId, 'SUCCESS');
                fetchNodes();
                refreshStorage();
                showToast(`${itemType === 'folder' ? 'Folder' : 'File'} deleted successfully`, 'success');
            } else {
                throw new Error('Failed to delete');
            }
        } catch (err) {
            updateTask(taskId, 'ERROR');
            showToast(`Error deleting ${node.name}`, 'error');
        }
    };

    // Drag and Drop Logic
    // Drag and Drop Logic
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // If we are dragging an internal node (Move), ignore file upload overlay
        if (draggedNode) return;

        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        // If dragging internal node, ignore main drop area (Move happens in row onDrop)
        if (draggedNode) return;

        // Simple Drop supports files currently.
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                await uploadFileToId(e.dataTransfer.files[i], currentFolderId);
            }
            fetchNodes();
            refreshStorage();
        }
        // NOTE: Full folder drop support requires DataTransferItem.webkitGetAsEntry() recursion
        // which is complex to implement robustly in one step.
        // For "Folder Upload" via Drop, users often expect it to just work.
        // The File Input "directory" attribute is safer for this specific request flow.
    };

    const navigateToFolder = (folder: StorageNode) => {
        const projectKey = urlProjectId; // Use the same key from current URL (name or ID)
        if (!projectKey) return;

        const currentPath = folderPath && folderPath.length > 0 ? folderPath.join('/') : '';
        const newPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
        router.push(`/drive/${projectKey}/${newPath}`);
    };

    const navigateUp = (index: number) => {
        const projectKey = urlProjectId;
        if (!projectKey) {
            router.push('/drive');
            return;
        }

        if (index === -1) {
            router.push(`/drive/${projectKey}`);
        } else {
            if (folderChain.length > 0) {
                const newPathKeys = folderChain.slice(0, index + 1).map(f => f.name);
                router.push(`/drive/${projectKey}/${newPathKeys.join('/')}`);
            }
        }
    };

    // Sharing Top Bar
    // Sharing Top Bar
    const handleShareClick = async () => {
        if (!currentFolderId) {
            showToast("Cannot share root drive. Please enter a folder.", 'error');
            return;
        }

        try {
            // Fetch current node settings
            const { data, error } = await supabase
                .from('storage_nodes')
                .select('sharing_scope, share_password')
                .eq('id', currentFolderId)
                .single();

            if (error) throw error;

            setShareNodeId(currentFolderId);
            setShareConfig({
                scope: (data.sharing_scope as 'PRIVATE' | 'PUBLIC') || 'PRIVATE',
                passwordEnabled: !!data.share_password,
                password: data.share_password || ''
            });
            setIsShareModalOpen(true);

        } catch (e) {
            console.error(e);
            showToast("Failed to fetch share settings", "error");
        }
    };

    const handleSaveShare = async () => {
        if (!shareNodeId) return;
        setIsSavingShare(true);

        try {
            const updates = {
                id: shareNodeId,
                sharing_scope: shareConfig.scope,
                share_password: (shareConfig.scope === 'PUBLIC' && shareConfig.passwordEnabled && shareConfig.password)
                    ? shareConfig.password
                    : null // Send null to clear password if disabled or private
            };

            const res = await fetch('/api/drive', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (!res.ok) throw new Error("Failed to update share settings");

            // Generate Link
            const link = `${window.location.origin}/share/${shareNodeId}`;
            navigator.clipboard.writeText(link);

            showToast("Settings saved & Link copied!", "success");
            setIsShareModalOpen(false);

        } catch (e) {
            showToast("Failed to save share settings", "error");
        } finally {
            setIsSavingShare(false);
        }
    };

    const fetchVersionHistory = async (node: StorageNode) => {
        if (node.type !== 'FILE') {
            showToast("Version history is only available for files.", "info");
            return;
        }
        setSelectedHistoryNode(node);
        setIsVersionHistoryOpen(true);
        try {
            const res = await fetch(`/api/drive/versions?nodeId=${node.id}`);
            if (!res.ok) throw new Error('Failed to fetch version history');
            const data = await res.json();
            setVersionNodes(data || []);
        } catch (e) {
            console.error("Error fetching version history:", e);
            showToast("Failed to load version history.", "error");
            setIsVersionHistoryOpen(false);
        }
    };

    const handleRollback = async (versionToRollback: StorageNode) => {
        if (!selectedHistoryNode || !versionToRollback) return;
        setPendingRollback(versionToRollback); // Trigger custom overlay
    };

    const confirmRollbackExecute = async () => {
        if (!selectedHistoryNode || !pendingRollback) return;

        setIsRollingBack(true);
        const versionToRestore = pendingRollback;
        setPendingRollback(null); // Close confirmation

        try {
            const res = await fetch('/api/drive/versions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nodeId: versionToRestore.id
                })
            });

            if (!res.ok) throw new Error('Failed to rollback file');

            showToast(`"${selectedHistoryNode.name}" restored to version ${versionToRestore.version}`, 'success');
            setIsVersionHistoryOpen(false);
            fetchNodes(); // Refresh the main file list
            refreshStorage(); // Update quota
        } catch (e) {
            console.error("Error rolling back file:", e);
            showToast("Failed to roll back file.", "error");
        } finally {
            setIsRollingBack(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900" onClick={() => setIsUploadMenuOpen(false)}>
            <Sidebar />

            <main
                className="flex-1 ml-0 md:ml-64 p-8 relative"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                {/* Content Logic */}
                {(!currentProject && !urlProjectId) ? (
                    <div className="max-w-4xl mx-auto mt-10">
                        <h1 className="text-3xl font-bold text-slate-800 mb-6">Select Project</h1>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map(project => (
                                <div
                                    key={project.id}
                                    onClick={() => router.push(`/drive/${encodeURIComponent(project.name)}`)}
                                    className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-blue-300 group relative"
                                >
                                    {/* Delete Project Button - OPTIONAL: Only admin can delete */}
                                    {isAdmin && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProject(project);
                                            }}
                                            className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10"
                                            title="Delete Project"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    )}
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                            <FolderPlus className="w-6 h-6" />
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-700">{project.name}</h3>
                                    <p className="text-sm text-slate-500 mt-1 mb-4 line-clamp-2">{project.description || "No description"}</p>

                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-blue-500 h-1.5 rounded-full"
                                            style={{ width: `${Math.min((project.current_storage_bytes / project.max_storage_bytes) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs text-slate-400">
                                        <span>{(project.current_storage_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
                                        <span>{(project.max_storage_bytes / (1024 * 1024 * 1024)).toFixed(0)} GB Max</span>
                                    </div>
                                </div>
                            ))}
                            <div
                                onClick={() => setIsCreatingProject(true)}
                                className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors min-h-[200px]"
                            >
                                <Plus className="w-8 h-8 mb-2" />
                                <span className="font-semibold">Create New Project</span>
                            </div>
                        </div>
                    </div>
                ) : (!currentProject && urlProjectId) ? (
                    <div className="flex flex-col items-center justify-center min-vh-[60vh] py-20">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                        <p className="text-slate-400 font-medium">Syncing project...</p>
                    </div>
                ) : (
                    <>
                        {/* Project Header Bar */}
                        <div className="mb-6 flex items-center justify-between">
                            <button onClick={() => { setCurrentProject(null); router.push('/drive'); }} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <span className="text-sm">← Projects</span>
                            </button>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                                {currentProject!.name}
                                {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                            </h2>
                        </div>
                        <div className="text-sm text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                            Quote:
                            <span className={`font-semibold ml-1 ${(currentProject!.current_storage_bytes / currentProject!.max_storage_bytes) > 0.9 ? 'text-red-500' : 'text-slate-700'}`}>
                                {(currentProject!.current_storage_bytes / (1024 * 1024)).toFixed(2)} MB
                            </span>
                            / {(currentProject!.max_storage_bytes / (1024 * 1024)).toFixed(0)} MB
                        </div>

                        {/* Drag Overlay */}
                        {dragActive && (
                            <div className="absolute inset-0 bg-blue-100/90 border-4 border-blue-500 border-dashed z-50 flex items-center justify-center rounded-xl m-4 backdrop-blur-sm transition-all">
                                <div className="text-center">
                                    <Cloud className="w-16 h-16 text-blue-600 mx-auto mb-4 animate-bounce" />
                                    <h3 className="text-2xl font-bold text-blue-700">Drop files to upload</h3>
                                </div>
                            </div>
                        )}

                        {/* Navbar / Breadcrumbs */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative z-20">
                            {/* Breadcrumbs */}
                            <div className="flex items-center gap-2 text-sm text-slate-500 overflow-x-auto my-2 sm:my-0">
                                <button
                                    onClick={() => navigateUp(-1)}
                                    className={`flex items-center gap-1 hover:text-blue-600 px-2 py-1 rounded-md transition-colors ${!slug || slug.length === 0 ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`}
                                >
                                    <HomeIcon className="w-4 h-4" />
                                    <span>My Files</span>
                                </button>
                                {folderChain.map((f, i) => (
                                    <React.Fragment key={f.id}>
                                        <ChevronRight className="w-4 h-4 text-slate-300" />
                                        <button
                                            onClick={() => navigateUp(i)}
                                            className={`hover:text-blue-600 px-2 py-1 rounded-md transition-colors whitespace-nowrap ${i === folderChain.length - 1 ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`}
                                        >
                                            {f.name}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Controls */}
                            <div className="flex bg-slate-100 p-1 rounded-lg gap-1 relative">

                                <button
                                    onClick={handleShareClick}
                                    disabled={!currentFolderId}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 rounded-md shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Share2 className="w-4 h-4" />
                                    Share
                                </button>
                                <button
                                    onClick={handleDownloadCurrentFolder}
                                    disabled={!currentFolderId || isDownloading}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 rounded-md shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Download
                                </button>
                                <button
                                    onClick={handleCreateFolderClick}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 rounded-md shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-medium"
                                >
                                    <FolderPlus className="w-4 h-4" />
                                    New Folder
                                </button>

                                {/* Upload Menu */}
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsUploadMenuOpen(!isUploadMenuOpen); }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 transition-all text-sm font-medium"
                                    >
                                        <FileUp className="w-4 h-4" />
                                        Upload
                                    </button>

                                    {/* Dropdown */}
                                    {isUploadMenuOpen && (
                                        <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[60] animate-in fade-in zoom-in-95 duration-200">
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3"
                                            >
                                                <Upload className="w-4 h-4 text-blue-500" />
                                                Upload Files
                                            </button>
                                            <button
                                                onClick={triggerFolderUploadSelection}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3"
                                            >
                                                <FolderUp className="w-4 h-4 text-indigo-500" />
                                                Upload Folder
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Hidden Inputs */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={handleFileUploadChange}
                                    multiple
                                />
                                <input
                                    ref={folderInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={handleFolderInputCreate}
                                    {...({ webkitdirectory: "", directory: "" } as any)}
                                />
                            </div>
                        </div>

                        {/* Content */}
                        {loading ? (
                            <div className="flex justify-center p-20">
                                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden z-0 relative">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50/50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Name</th>
                                            <th className="px-6 py-4">Owner</th>
                                            <th className="px-6 py-4">Modified</th>

                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {/* New Folder Input Row */}
                                        {isCreatingFolder && (
                                            <tr className="bg-blue-50/50 animate-in fade-in duration-300">
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                                                            <Folder className="w-5 h-5 fill-current" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <input
                                                                ref={newFolderInputRef}
                                                                type="text"
                                                                value={newFolderName}
                                                                onChange={(e) => setNewFolderName(e.target.value)}
                                                                onKeyDown={handleNewFolderKeyDown}
                                                                onBlur={() => confirmCreateFolder()}
                                                                className="w-full max-w-sm px-3 py-1.5 text-sm border border-blue-400 bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                                                                placeholder="Folder Name"
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td colSpan={3} className="px-6 py-3 text-xs text-slate-400">
                                                    Press Enter to create, Esc to cancel
                                                </td>
                                            </tr>
                                        )}

                                        {nodes.length === 0 && !isCreatingFolder && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-16 text-center">
                                                    <div className="flex flex-col items-center justify-center text-slate-400">
                                                        <FolderPlus className="w-12 h-12 mb-3 opacity-20" />
                                                        <p className="text-lg font-medium text-slate-600">This folder is empty</p>
                                                        <p className="text-sm">Drag and drop files here to upload</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {nodes.map(node => (
                                            <tr
                                                key={node.id}
                                                draggable={isAdmin || node.owner_email === userEmail}
                                                onDragStart={(e) => {
                                                    if (!(isAdmin || node.owner_email === userEmail)) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    setDraggedNode(node);
                                                    e.dataTransfer.effectAllowed = 'move';
                                                }}
                                                onDragOver={(e) => {
                                                    if (draggedNode && node.type === 'FOLDER' && node.id !== draggedNode.id) {
                                                        e.preventDefault(); // Allow drop
                                                        e.stopPropagation();
                                                        setDragOverNodeId(node.id);
                                                        e.dataTransfer.dropEffect = 'move';
                                                    }
                                                }}
                                                onDragLeave={(e) => {
                                                    if (dragOverNodeId === node.id) {
                                                        setDragOverNodeId(null);
                                                    }
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation(); // Stop main drop zone from triggering
                                                    setDragOverNodeId(null);
                                                    if (draggedNode && node.type === 'FOLDER' && node.id !== draggedNode.id) {
                                                        handleMoveNode(draggedNode, node.id);
                                                        setDraggedNode(null);
                                                    }
                                                }}
                                                className={`group transition-all cursor-pointer duration-200 ${dragOverNodeId === node.id ? 'bg-blue-100 ring-2 ring-inset ring-blue-500 z-10' : 'hover:bg-blue-50/30'}`}
                                                onClick={() => { if (node.type === 'FOLDER') navigateToFolder(node) }}
                                                onContextMenu={(e) => handleContextMenu(e, node)}
                                            >
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-4">
                                                        {node.type === 'FOLDER' ? (
                                                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-indigo-100 group-hover:scale-105 transition-all">
                                                                <Folder className="w-5 h-5 fill-current" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-blue-100 group-hover:scale-105 transition-all">
                                                                <FileText className="w-5 h-5" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="font-medium text-slate-700 group-hover:text-blue-700 transition-colors flex items-center gap-2">
                                                                {node.name}
                                                                {node.version && node.version > 1 && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600 border border-blue-200">
                                                                        v{node.version}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {node.type === 'FILE' && (
                                                                <p className="text-xs text-slate-400">{(node.size! / 1024).toFixed(1)} KB</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-sm text-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-white shadow-sm">
                                                            {node.owner_email?.[0].toUpperCase()}
                                                        </div>
                                                        <span className="truncate max-w-[120px] opacity-80">{node.owner_email?.split('@')[0]}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-sm text-slate-500 font-mono text-xs">
                                                    {format(new Date(node.updated_at), 'MMM d, yyyy')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Folder Upload Confirmation Overlay */}
            {isFolderUploadModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform">
                        <div className="mb-6 text-center">
                            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FolderUp className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800">Upload Folder?</h3>
                            <p className="text-slate-500 mt-2">
                                You are about to upload
                                <span className="font-semibold text-slate-800 mx-1">{pendingFolderStats.count} files</span>
                                ({pendingFolderStats.size}).
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setIsFolderUploadModalOpen(false); setPendingFolderUpload(null); }}
                                className="flex-1 py-3 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={startFolderUpload}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all transform active:scale-95"
                            >
                                Start Upload
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Project Modal */}
            {isCreatingProject && (
                <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform">
                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Create New Project</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={newProjectName}
                                        onChange={e => setNewProjectName(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. Marketing Q1"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Members (Select from Whitelist)</label>
                                    <div className="border border-slate-300 rounded-lg max-h-40 overflow-y-auto bg-slate-50 p-2">
                                        {whitelist.length === 0 ? (
                                            <p className="text-xs text-slate-400 p-2">No users in whitelist.</p>
                                        ) : (
                                            whitelist.map(email => (
                                                <label key={email} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={newProjectMembers.includes(email)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setNewProjectMembers(prev => [...prev, email]);
                                                            } else {
                                                                setNewProjectMembers(prev => prev.filter(m => m !== email));
                                                            }
                                                        }}
                                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm text-slate-700">{email}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Only whitelisted users can be added as members.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Max Storage (GB)</label>
                                    <input
                                        type="number"
                                        value={newProjectQuota}
                                        onChange={e => setNewProjectQuota(parseInt(e.target.value) || 0)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        min="1"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setIsCreatingProject(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateProject}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md transition-all"
                            >
                                Create Project
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {isShareModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Share2 className="w-5 h-5 text-blue-600" />
                                Share Settings
                            </h3>
                            <button
                                onClick={() => setIsShareModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Access Level */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-900 block mb-2">Access Level</label>

                                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${shareConfig.scope === 'PRIVATE' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                                    <input
                                        type="radio"
                                        name="scope"
                                        className="sr-only"
                                        checked={shareConfig.scope === 'PRIVATE'}
                                        onChange={() => setShareConfig(p => ({ ...p, scope: 'PRIVATE' }))}
                                    />
                                    <div className={`mt-0.5 p-1.5 rounded-lg ${shareConfig.scope === 'PRIVATE' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-slate-800">Private</div>
                                        <div className="text-sm text-slate-500">Only project members can access</div>
                                    </div>
                                    {shareConfig.scope === 'PRIVATE' && <Check className="w-5 h-5 text-blue-600 ml-auto mt-1" />}
                                </label>

                                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${shareConfig.scope === 'PUBLIC' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                                    <input
                                        type="radio"
                                        name="scope"
                                        className="sr-only"
                                        checked={shareConfig.scope === 'PUBLIC'}
                                        onChange={() => setShareConfig(p => ({ ...p, scope: 'PUBLIC' }))}
                                    />
                                    <div className={`mt-0.5 p-1.5 rounded-lg ${shareConfig.scope === 'PUBLIC' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <Globe className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-slate-800">Public</div>
                                        <div className="text-sm text-slate-500">Anyone with the link can view</div>
                                    </div>
                                    {shareConfig.scope === 'PUBLIC' && <Check className="w-5 h-5 text-blue-600 ml-auto mt-1" />}
                                </label>
                            </div>

                            {/* Public Options */}
                            {shareConfig.scope === 'PUBLIC' && (
                                <div className="pl-4 border-l-2 border-slate-100 ml-4 animate-in slide-in-from-top-2 fade-in duration-300">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${shareConfig.passwordEnabled ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'}`}>
                                            {shareConfig.passwordEnabled && <Check className="w-3.5 h-3.5" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={shareConfig.passwordEnabled}
                                            onChange={(e) => setShareConfig(p => ({ ...p, passwordEnabled: e.target.checked }))}
                                        />
                                        <span className="font-medium text-slate-700 flex items-center gap-2">
                                            <Lock className="w-4 h-4 text-slate-400" />
                                            Protect with Password
                                        </span>
                                    </label>

                                    {shareConfig.passwordEnabled && (
                                        <div className="mt-3">
                                            <input
                                                type="text"
                                                placeholder="Enter password..."
                                                value={shareConfig.password}
                                                onChange={(e) => setShareConfig(p => ({ ...p, password: e.target.value }))}
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono text-sm"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsShareModalOpen(false)}
                                className="px-5 py-2.5 text-slate-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 rounded-xl font-medium transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveShare}
                                disabled={isSavingShare}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isSavingShare ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        Save & Copy Link
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <TaskProgress
                tasks={tasks}
                onClearCompleted={clearCompletedTasks}
                onStop={handleStopUpload}
            />

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-[100] min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.node.type === 'FILE' && (
                        <button
                            onClick={() => {
                                window.open(`/api/files/${encodeURIComponent(contextMenu.node.r2_key!)}?filename=${encodeURIComponent(contextMenu.node.name)}`);
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"
                        >
                            <Download className="w-4 h-4 text-slate-500" />
                            Download
                        </button>
                    )}

                    <button
                        onClick={() => {
                            openShareModalForNode(contextMenu.node.id);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"
                    >
                        <Share2 className="w-4 h-4 text-slate-500" />
                        Share
                    </button>

                    <button
                        onClick={() => {
                            if (isAdmin || contextMenu.node.owner_email === userEmail) {
                                fetchVersionHistory(contextMenu.node);
                            } else {
                                showToast("Access Denied", "error");
                            }
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"
                    >
                        <History className="w-4 h-4 text-slate-500" />
                        Version History
                    </button>

                    <div className="my-1 border-t border-slate-100"></div>

                    <button
                        onClick={() => {
                            if (isAdmin || contextMenu.node.owner_email === userEmail) {
                                handleDelete(contextMenu.node);
                            } else {
                                showToast("Access Denied: You can only delete your own files.", "error");
                            }
                            setContextMenu(null);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 ${isAdmin || contextMenu.node.owner_email === userEmail
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-slate-300 cursor-not-allowed'
                            }`}
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </button>
                </div>
            )}
            {/* Version History Modal */}
            {isVersionHistoryOpen && selectedHistoryNode && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                        <History className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">Version History</h3>
                                        <p className="text-xs text-slate-500 truncate max-w-[300px]">{selectedHistoryNode.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsVersionHistoryOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>

                            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                {versionNodes.map((v, idx) => (
                                    <div key={v.id} className={`flex items-center justify-between p-4 rounded-xl border ${idx === 0 ? 'bg-blue-50/30 border-blue-100 ring-1 ring-blue-100' : 'border-slate-100 hover:bg-slate-50'} transition-all`}>
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col items-center">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${idx === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                    v{v.version}
                                                </span>
                                                {idx === 0 && <span className="text-[9px] text-blue-600 font-bold mt-1 uppercase">Active</span>}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800">
                                                    {format(new Date(v.updated_at), 'MMM d, yyyy · HH:mm')}
                                                </p>
                                                <p className="text-xs text-slate-500 flex items-center gap-2">
                                                    <span>{(v.size! / 1024).toFixed(1)} KB</span>
                                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                    <span>{v.owner_email?.split('@')[0]}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => window.open(`/api/files/${encodeURIComponent(v.r2_key!)}?filename=${encodeURIComponent(v.name)}`)}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                title="Download this version"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>

                                            {idx !== 0 && (
                                                <button
                                                    onClick={() => handleRollback(v)}
                                                    disabled={isRollingBack}
                                                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    Roll Back
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setIsVersionHistoryOpen(false)}
                                    className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Conflict Modal */}
            {conflictInfo && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                                    <AlertCircle className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900">File Already Exists</h3>
                            </div>

                            <p className="text-slate-600 mb-6 leading-relaxed">
                                A file named <span className="font-semibold text-slate-900 text-sm break-all">"{conflictInfo.file.name}"</span> already exists in this folder. What would you like to do?
                            </p>

                            <div className="space-y-3">
                                <button
                                    onClick={() => {
                                        uploadFileToId(conflictInfo.file, conflictInfo.parentId, conflictInfo.taskId, 'update');
                                        setConflictInfo(null);
                                    }}
                                    className="w-full flex flex-col items-start p-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-all group"
                                >
                                    <div className="flex items-center gap-2 font-bold mb-0.5">
                                        <ArrowUpCircle className="w-4 h-4" />
                                        Update Version
                                    </div>
                                    <div className="text-xs text-blue-600/80">Save as a new version (v{conflictInfo.data.version + 1})</div>
                                </button>

                                {conflictInfo.data.isOwnerOrAdmin && (
                                    <button
                                        onClick={() => {
                                            uploadFileToId(conflictInfo.file, conflictInfo.parentId, conflictInfo.taskId, 'overwrite');
                                            setConflictInfo(null);
                                        }}
                                        className="w-full flex flex-col items-start p-4 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl transition-all group"
                                    >
                                        <div className="flex items-center gap-2 font-bold mb-0.5">
                                            <RotateCcw className="w-4 h-4" />
                                            Overwrite
                                        </div>
                                        <div className="text-xs text-slate-500">Replace current version with this file</div>
                                    </button>
                                )}

                                <button
                                    onClick={() => {
                                        if (conflictInfo.taskId) updateTask(conflictInfo.taskId, 'CANCELLED');
                                        setConflictInfo(null);
                                    }}
                                    className="w-full py-3 text-slate-500 hover:text-slate-700 font-medium transition-colors"
                                >
                                    Cancel Upload
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Rollback Confirmation Overlay */}
            {pendingRollback && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-blue-100/50">
                                <RotateCcw className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Rollback</h3>
                            <p className="text-slate-500 text-sm leading-relaxed mb-6">
                                Are you sure you want to restore <span className="font-bold text-slate-800">"{selectedHistoryNode?.name}"</span> to <span className="text-blue-600 font-bold underline">version {pendingRollback.version}</span>?
                                <br />
                                <span className="text-[10px] opacity-70 mt-2 block">(This will create a new version copy)</span>
                            </p>

                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={confirmRollbackExecute}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                                >
                                    Confirm Restore
                                </button>
                                <button
                                    onClick={() => setPendingRollback(null)}
                                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
