'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/layout/Sidebar';
import {
    Cloud, Search, Plus, Loader2, FolderPlus, FileUp, Home as HomeIcon,
    ChevronRight, Copy, Share2, Download, Trash2, FileText, Folder, Calendar,
    Settings, MoreVertical, Upload, FolderUp, Lock, Globe, Users, X, Check,
    AlertCircle, ArrowUpCircle, RotateCcw, History, Pencil, Info, ArrowUp, ArrowDown
} from 'lucide-react';
const CreateNoteModal = dynamic<any>(() => import('@/features/drive/CreateNoteModal'), { ssr: false });
const MoveToModal = dynamic<any>(() => import('@/features/drive/MoveToModal'), { ssr: false });
import { StorageNode, Project } from '@/types';
import { createClient } from '@/utils/supabase/client';
import { format } from 'date-fns';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { TaskProgress, AsyncTask } from '@/features/drive/TaskProgress';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/contexts/ToastContext';
import { useStorage } from '@/contexts/StorageContext';
import { useActionContext } from '@/contexts/ActionContext';
import { useActionCache } from '@/hooks/useActionCache';
import { CACHE_KEYS } from '@/constants/cacheKeys';
import { prefetchAction } from '@/hooks/useActionCache';

import { useAuth } from '@/contexts/AuthContext';

const FileInfoPanel = dynamic<any>(() => import('@/features/drive/FileInfoPanel'), { ssr: false });
import { PlannerEditor } from '@/features/drive/PlannerEditor';
import { InputModal } from '@/components/ui/InputModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DriveToolbar } from '@/features/drive/DriveToolbar';
import { DriveNodesList } from '@/features/drive/DriveNodesList';
import { DrivePreviewModal } from '@/features/drive/DrivePreviewModal';

export default function DrivePage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string[] | undefined;
    const { showToast } = useToast();
    const { refreshStorage } = useStorage();
    const { isAdmin, userEmail, userId } = useAuth();
    const supabase = createClient();

    // Project structure: /drive/[projectId]/[...folders]
    const slugKey = slug?.join('/') || '';
    const urlProjectId = slug?.[0];
    const folderPath = React.useMemo(() => (slug?.slice(1) || []).map(s => decodeURIComponent(s)), [slugKey]); // Use slugKey for stability
    const folderPathKey = folderPath.join('/');

    const { projects, projectsLoading, refreshProjects } = useActionContext();
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    // Derived values from cache
    // const [nodes, setNodes] = useState<StorageNode[]>([]); // Removed
    // const [loading, setLoading] = useState(true); // Removed
    // const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // Removed
    // const [folderChain, setFolderChain] = useState<{ id: string, name: string }[]>([]); // Removed

    // New Actions State
    const [isMoveToModalOpen, setIsMoveToModalOpen] = useState(false);
    const [nodesToMove, setNodesToMove] = useState<StorageNode[]>([]);
    const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
    const [infoPanelNode, setInfoPanelNode] = useState<StorageNode | null>(null);

    // Optimistic UI for Uploads
    const [optimisticNodes, setOptimisticNodes] = useState<StorageNode[]>([]);

    // Chunk Loading / Infinite Scroll
    const [displayNodes, setDisplayNodes] = useState<StorageNode[]>([]);
    const displayNodesRef = useRef<StorageNode[]>([]);
    useEffect(() => { displayNodesRef.current = displayNodes; }, [displayNodes]);

    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const LIMIT = 50;


    // Hydrate from localStorage
    // Unified Fetcher for useActionCache
    const fetchFolderData = useCallback(async (currentOffset = 0) => {
        if (!urlProjectId) return null;
        let url = `/api/drive?project=${encodeURIComponent(urlProjectId)}&limit=${LIMIT}&offset=${currentOffset}`;
        if (folderPath && folderPath.length > 0) {
            url += `&path=${folderPath.map(s => encodeURIComponent(s)).join('/')}`;
        }
        const res = await fetch(url);
        if (res.status === 404) throw new Error('NOT_FOUND');
        if (!res.ok) throw new Error('Failed to load');
        return await res.json();
    }, [urlProjectId, folderPathKey]);

    const cachedFetcher = useCallback(() => fetchFolderData(0), [fetchFolderData]);

    const {
        data: folderData,
        loading: folderLoading,
        refresh: refreshFolder
    } = useActionCache<any>(
        CACHE_KEYS.NODES(urlProjectId || '', folderPathKey),
        cachedFetcher,
        {
            persist: true,
            onSuccess: (data) => {
                if (!data) return;
                setDisplayNodes(data.nodes || []);
                setHasMore(data.hasMore || false);
                setOffset(data.nodes?.length || 0);
            },
            onError: (err) => {
                if (err.message === 'NOT_FOUND') {
                    showToast('Folder not found', 'error');
                    router.push('/drive');
                }
            }
        }
    );

    // Reset display nodes when changing folder
    useEffect(() => {
        setDisplayNodes([]);
        setOffset(0);
        setHasMore(false);
    }, [urlProjectId, folderPathKey]);

    const loadMore = useCallback(async () => {
        if (!hasMore || isFetchingMore || !urlProjectId) return;
        setIsFetchingMore(true);
        try {
            const data = await fetchFolderData(offset);
            if (data && data.nodes) {
                setDisplayNodes(prev => [...prev, ...data.nodes]);
                setOffset(prev => prev + data.nodes.length);
                setHasMore(data.hasMore);
            }
        } catch (error) {
            showToast('Failed to load more items', 'error');
        } finally {
            setIsFetchingMore(false);
        }
    }, [hasMore, isFetchingMore, urlProjectId, offset, fetchFolderData, showToast]);

    const nodes: StorageNode[] = React.useMemo(() => {
        const serverNodes = displayNodes;
        // Use a set of names+types for O(1) lookup during filtering
        const serverNodeKeys = new Set(serverNodes.map((s: any) => `${s.name}-${s.type}`));

        // Filter out optimistic nodes that have already appeared on server
        const filteredOptimistic = optimisticNodes.filter(o =>
            !serverNodeKeys.has(`${o.name}-${o.type}`)
        );
        return [...filteredOptimistic, ...serverNodes];
    }, [displayNodes, optimisticNodes]);
    const currentFolderId = folderData?.currentFolderId || null;
    const folderChain = React.useMemo(() => folderData?.breadcrumbs || [], [folderData]);
    const loading = folderLoading && !folderData;

    // Sync Current Project state separately (as it persists across folder changes)
    useEffect(() => {
        // Try load from cache first
        if (!currentProject && urlProjectId) {
            const cached = localStorage.getItem(CACHE_KEYS.PROJECT_DETAILS(urlProjectId));
            if (cached) {
                try { setCurrentProject(JSON.parse(cached)); } catch (e) { }
            }
        }

        if (folderData?.project) {
            setCurrentProject(folderData.project);
            localStorage.setItem(CACHE_KEYS.PROJECT_DETAILS(urlProjectId || ''), JSON.stringify(folderData.project));
        }
    }, [folderData, urlProjectId]);

    // Shim for existing codebase calling "fetchNodes"
    const fetchNodes = useCallback(async (force = false, silent = false) => {
        // Prevent background polling from resetting the list if user has loaded more chunks
        if (silent && displayNodesRef.current.length > LIMIT) return;

        await refreshFolder(silent);
    }, [refreshFolder]);


    const breadcrumbsToRender = React.useMemo(() => {
        return folderPath.map((name, index) => {
            const match = folderChain[index];
            // Compare names case-insensitively to match URL with API data
            if (match && match.name.toLowerCase() === name.toLowerCase()) {
                return match;
            }
            return { id: `opt-${index}-${name}`, name: name };
        });
    }, [folderPath, folderChain]);

    const [tasks, setTasks] = useState<AsyncTask[]>([]);
    const [dragActive, setDragActive] = useState(false);

    // Inputs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // New Folder UI State
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("New Folder");
    const newFolderInputRef = useRef<HTMLInputElement>(null);

    // Create Note State
    const [isCreateNoteModalOpen, setIsCreateNoteModalOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<StorageNode | null>(null);
    const [editInitialContent, setEditInitialContent] = useState<string>("");

    const prefetchFolder = useCallback((folder: StorageNode) => {
        if (!urlProjectId || !folder.name) return;
        const currentPath = folderPath && folderPath.length > 0 ? folderPath.join('/') : '';
        const newPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;

        prefetchAction(
            CACHE_KEYS.NODES(urlProjectId, newPath),
            async () => {
                let url = `/api/drive?project=${encodeURIComponent(urlProjectId)}&path=${encodeURIComponent(newPath)}&limit=50`;
                const res = await fetch(url);
                return await res.json();
            }
        );
    }, [urlProjectId, folderPath]);

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
    const [isLoadingWhitelist, setIsLoadingWhitelist] = useState(true);
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

    // Project Settings State
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [projectSettings, setProjectSettings] = useState<{ notify_on_activity: boolean, version_retention_limit?: number, read_only?: boolean }>({ notify_on_activity: false, version_retention_limit: 0, read_only: false });
    const [projectMembers, setProjectMembers] = useState<string[]>([]);
    const [settingsTab, setSettingsTab] = useState<'general' | 'members'>('general');
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<StorageNode | null>(null);
    // Planner State
    const [plannerState, setPlannerState] = useState<{
        isOpen: boolean;
        file: StorageNode | null;
        content: any | null;
    }>({ isOpen: false, file: null, content: null });

    const [isCreatePlannerModalOpen, setIsCreatePlannerModalOpen] = useState(false);

    // Helper for Small File Proxy Upload (Workaround for CORS)
    const uploadProxyFile = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', file.name);
        formData.append('parentId', currentFolderId || 'null');
        if (currentProject) formData.append('projectId', currentProject.id);

        const res = await fetch('/api/drive/upload/proxy', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Upload failed');
        }
        return 'SUCCESS';
    };

    const handleCreatePlannerClick = () => {
        if (!currentProject) {
            showToast("Please open a project first", "error");
            return;
        }
        setIsUploadMenuOpen(false);
        setIsCreatePlannerModalOpen(true);
    };

    const handleCreatePlannerSubmit = async (name: string) => {
        if (!name) return;

        try {
            const fileName = `${name}.splan`;
            const initialContent = JSON.stringify({
                title: name,
                tasks: [],
                lastModified: new Date().toISOString()
            });

            const file = new File([initialContent], fileName, { type: 'text/plain' });

            // Use Proxy Upload
            await uploadProxyFile(file);
            showToast("Planner created", "success");
            fetchNodes(true);
        } catch (e) {
            console.error("Planner creation error:", e);
            showToast("Error creating planner", "error");
        }
    };

    const handleSavePlanner = async (data: any) => {
        if (!plannerState.file) return;

        const fileName = plannerState.file.name;
        const content = JSON.stringify(data);
        const file = new File([content], fileName, { type: 'text/plain' });

        try {
            await uploadProxyFile(file);
            fetchNodes(true, true);
            showToast("Planner saved successfully", "success");
        } catch (e) {
            console.error("Save planner failed", e);
            showToast("Failed to save planner", "error");
            throw e;
        }
    };

    // Prevent closing tab while uploading
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isUploadingRef.current) {
                e.preventDefault();
                e.returnValue = ''; // Chrome requires returnValue to be set
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

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
    const [searchContextMenu, setSearchContextMenu] = useState<{ x: number, y: number, node: StorageNode } | null>(null);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [nodeToRename, setNodeToRename] = useState<StorageNode | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);

    // Generic Delete Modal State
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => Promise<void>;
        isDeleting: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: async () => { },
        isDeleting: false
    });

    // Bulk Selection State
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

    // Clear selection on navigation
    useEffect(() => {
        setSelectedNodeIds(new Set());
    }, [currentFolderId, urlProjectId]);

    const toggleNodeSelection = (id: string) => {
        setSelectedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedNodeIds.size === nodes.length && nodes.length > 0) {
            setSelectedNodeIds(new Set());
        } else {
            setSelectedNodeIds(new Set(nodes.map(n => n.id)));
        }
    };

    const handleBulkDownload = () => {
        if (selectedNodeIds.size === 0) return;
        setIsDownloading(true);
        const ids = Array.from(selectedNodeIds).join(',');
        window.location.href = `/api/drive/zip?nodeIds=${ids}`;
        setTimeout(() => {
            setIsDownloading(false);
            setSelectedNodeIds(new Set());
        }, 2000);
    };

    const confirmBulkDelete = async () => {
        const toastId = addTask('DELETE', `Deleting ${selectedNodeIds.size} items...`);
        const ids = Array.from(selectedNodeIds);
        let successCount = 0;

        for (const id of ids) {
            try {
                await fetch(`/api/drive?id=${id}&project=${currentProject?.id}`, { method: 'DELETE' });
                successCount++;
            } catch (e) {
                console.error(`Failed to delete ${id}`, e);
            }
        }

        updateTask(toastId, 'SUCCESS');
        showToast(`Moved ${successCount} items to Trash`, 'success');
        setSelectedNodeIds(new Set());
        fetchNodes(true);
        setDeleteModal(prev => ({ ...prev, isOpen: false }));
    };

    const handleBulkDelete = () => {
        if (selectedNodeIds.size === 0) return;
        setDeleteModal({
            isOpen: true,
            title: 'Delete Items',
            message: `Are you sure you want to move ${selectedNodeIds.size} items to trash?`,
            onConfirm: confirmBulkDelete,
            isDeleting: false
        });
    };

    // --- Search Logic ---
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<StorageNode[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // --- Sorting State ---
    const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'size' | 'updated_at', direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

    const handleSort = (key: 'name' | 'size' | 'updated_at') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedNodes = React.useMemo(() => {
        const sortable = [...nodes];
        sortable.sort((a, b) => {
            // Folders always first
            if (a.type !== b.type) return a.type === 'FOLDER' ? -1 : 1;

            let result = 0;
            switch (sortConfig.key) {
                case 'name':
                    result = a.name.localeCompare(b.name);
                    break;
                case 'size':
                    result = (a.size || 0) - (b.size || 0);
                    break;
                case 'updated_at':
                    result = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
                    break;
            }
            return sortConfig.direction === 'asc' ? result : -result;
        });
        return sortable;
    }, [nodes, sortConfig]);


    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input/textarea is focused or modal is open
            if (
                ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) ||
                isRenameModalOpen ||
                isShareModalOpen ||
                isProjectSettingsOpen ||
                deleteModal.isOpen
            ) return;

            // Select All (Ctrl+A / Cmd+A)
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                setSelectedNodeIds(new Set(nodes.map(n => n.id)));
            }

            // Delete (Del / Backspace)
            if (e.key === 'Delete' && selectedNodeIds.size > 0) {
                e.preventDefault();
                handleBulkDelete();
            }

            // Clear Selection (Esc)
            if (e.key === 'Escape') {
                if (selectedNodeIds.size > 0) {
                    setSelectedNodeIds(new Set());
                } else if (contextMenu) {
                    setContextMenu(null);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nodes, selectedNodeIds, isRenameModalOpen, isShareModalOpen, isProjectSettingsOpen, deleteModal.isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setSearchQuery(""); // Close dropdown
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!searchQuery.trim() || !currentProject) {
            setSearchResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`/api/drive/search?projectId=${currentProject.id}&q=${encodeURIComponent(searchQuery)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data);
                }
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, currentProject]);


    // --- File Preview Logic ---
    const [previewNode, setPreviewNode] = useState<StorageNode | null>(null);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    const handlePreview = async (node: StorageNode) => {
        if (node.type === 'FOLDER') return;

        const ext = node.name.split('.').pop()?.toLowerCase() || '';

        // SPLAN: Open Planner Editor directly
        if (ext === 'splan') {
            if (!node.r2_key) {
                showToast("File content not found", "error");
                return;
            }

            // Show loading feedback
            showToast("Opening planner...", "info");

            try {
                const url = `/api/files/${encodeURIComponent(node.r2_key)}?filename=${encodeURIComponent(node.name)}`;
                const res = await fetch(url);

                if (res.ok) {
                    const text = await res.text();
                    try {
                        const json = JSON.parse(text);
                        setPlannerState({ isOpen: true, file: node, content: json });
                    } catch (e) {
                        console.error("Invalid splan JSON", e);
                        showToast("Invalid planner file format", "error");
                    }
                } else {
                    throw new Error("Failed to fetch file");
                }
            } catch (e) {
                console.error("Error opening planner:", e);
                showToast("Failed to open planner", "error");
            }
            return;
        }

        // Standard Preview Logic
        setPreviewNode(node);
        setPreviewContent(null);

        const isText = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'css', 'html', 'py', 'java', 'c', 'cpp', 'csv', 'xml', 'yml', 'yaml', 'sql', 'log'].includes(ext);

        if (isText && node.r2_key) {
            setLoadingPreview(true);
            try {
                // Fetch content
                const url = `/api/files/${encodeURIComponent(node.r2_key)}?filename=${encodeURIComponent(node.name)}`;

                // 1. Check HEAD first or just use Range header if supported (but R2 proxy might not support Range easily without setup)
                // For now, we fetch and abort if too large during stream, or check Content-Length
                const res = await fetch(url);

                if (res.ok) {
                    const size = Number(res.headers.get('Content-Length'));
                    // Limit preview to 1MB
                    if (size && size > 1024 * 1024) {
                        setPreviewContent("File is too large to preview ( > 1MB). Please download to view.");
                    } else {
                        // Double protection: strict text limit
                        const blob = await res.blob();
                        if (blob.size > 1024 * 1024) {
                            setPreviewContent("File is too large to preview ( > 1MB). Please download to view.");
                        } else {
                            const text = await blob.text();
                            setPreviewContent(text);
                        }
                    }
                } else {
                    setPreviewContent("Failed to load content.");
                }
            } catch (e) {
                console.error("Preview error", e);
                setPreviewContent("Error loading content.");
            } finally {
                setLoadingPreview(false);
            }
        }
    };

    const closePreview = () => {
        setPreviewNode(null);
        setPreviewContent(null);
    };

    const [isDownloading, setIsDownloading] = useState(false);

    const handleMainDownload = () => {
        if (selectedNodeIds.size > 0) {
            handleBulkDownload();
            return;
        }

        if (!currentFolderId) return;

        setIsDownloading(true);
        window.location.href = `/api/drive/zip?folderId=${currentFolderId}`;
        setTimeout(() => setIsDownloading(false), 2000);
    };

    useEffect(() => {
        const handleClick = () => {
            setContextMenu(null);
            setSearchContextMenu(null);
        };
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

    const handleMoveNode = async (sourceNode: StorageNode, targetFolderId: string | null) => {
        if (targetFolderId && sourceNode.id === targetFolderId) return; // Cannot move into self

        // If targetFolderId is null, moving to Root
        const taskName = targetFolderId ? "Moving item..." : "Moving to Root...";

        const toastId = addTask('UPLOAD', taskName);
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
            fetchNodes(true);
        } catch (e) {
            console.error(e);
            updateTask(toastId, 'ERROR');
            showToast("Failed to move item", "error");
        }
    };

    const openShareModalForNode = async (nodeId: string) => {
        setShareNodeId(nodeId);
        setIsShareModalOpen(true);

        try {
            const { data, error } = await supabase
                .from('storage_nodes')
                .select('sharing_scope, share_password')
                .eq('id', nodeId)
                .single();

            if (error) throw error;

            setShareConfig({
                scope: (data.sharing_scope as 'PRIVATE' | 'PUBLIC') || 'PRIVATE',
                passwordEnabled: !!data.share_password,
                password: data.share_password || ''
            });

        } catch (e) {
            console.error(e);
            showToast("Failed to fetch share settings", "error");
            setIsShareModalOpen(false);
        }
    };

    useEffect(() => {
        const fetchWhitelist = async () => {
            try {
                const { data } = await supabase.from('whitelist').select('email').order('email');
                if (data) setWhitelist(data.map(u => u.email));
            } catch (error) {
                console.error("Error fetching whitelist:", error);
            } finally {
                setIsLoadingWhitelist(false);
            }
        };
        fetchWhitelist();
    }, []);


    // fetchProjects removed (handled by Context)
    // fetchNodes shim defined above

    // Original fetchNodes logic replaced by useActionCache and shim above

    // Initial Fetch when ID changes
    useEffect(() => {
        fetchNodes();
    }, [urlProjectId, folderPathKey, fetchNodes]);

    // Background Polling - DISABLED due to performance issues/freezing
    // useEffect(() => {
    //     const interval = setInterval(() => {
    //         if (document.visibilityState === 'visible' && !loading) {
    //             fetchNodes(true, true);
    //         }
    //     }, 5000);

    //     return () => clearInterval(interval);
    // }, [fetchNodes, loading]);

    const prefetchedPathsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        prefetchedPathsRef.current.clear();
    }, [urlProjectId, folderPathKey]);

    // Prefetch next level folders for smoother navigation (A->B->C->D pattern)
    useEffect(() => {
        const folderNodes = nodes.filter(n => n.type === 'FOLDER').slice(0, 3);
        if (folderNodes.length === 0 || !urlProjectId) return;

        let isMounted = true;
        const prefetch = async () => {
            for (const folder of folderNodes) {
                if (!isMounted) break;

                const childPathParts = [...(folderPath || []), folder.name];
                const childPathKey = childPathParts.join('/');

                // Skip if already prefetched in this session
                if (prefetchedPathsRef.current.has(childPathKey)) continue;

                const cacheKey = CACHE_KEYS.NODES(urlProjectId, childPathKey);

                try {
                    const pathParam = childPathParts.map(s => encodeURIComponent(s)).join('/');
                    const res = await fetch(`/api/drive?project=${encodeURIComponent(urlProjectId)}&path=${pathParam}`);
                    if (!isMounted) break;

                    if (res.ok) {
                        const data = await res.json();
                        if (!isMounted) break;
                        localStorage.setItem(cacheKey, JSON.stringify(data));
                        prefetchedPathsRef.current.add(childPathKey);
                    }
                } catch (e) {
                    console.error("Prefetch failed for", childPathKey, e);
                }
            }
        };

        const timer = setTimeout(prefetch, 1000);
        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [nodes, urlProjectId, folderPath]);



    useEffect(() => {
        if (isProjectSettingsOpen && currentProject) {
            const proj = currentProject as any;
            setProjectSettings({
                notify_on_activity: proj.notify_on_activity ?? proj.settings?.notify_on_activity ?? false,
                version_retention_limit: proj.version_retention_limit ?? proj.settings?.version_retention_limit ?? 0,
                read_only: proj.read_only ?? proj.settings?.read_only ?? false
            });
            setSettingsTab('general');

            // Fetch members
            const fetchData = async () => {
                try {
                    // Fetch existing members
                    const { data: membersData, error: membersError } = await supabase
                        .from('project_members')
                        .select('user_email')
                        .eq('project_id', currentProject.id);

                    if (membersError) throw membersError;
                    if (membersData) setProjectMembers(membersData.map(d => d.user_email));

                    // Fetch Whitelist for dropdown
                    const { data: whitelistData, error: whitelistError } = await supabase
                        .from('whitelist')
                        .select('email');

                    if (whitelistError) throw whitelistError;
                    if (whitelistData) setWhitelist(whitelistData.map(row => row.email));

                } catch (e) {
                    console.error("Error fetching project settings data:", e);
                    // Don't show toast to avoid spamming if just one part fails, or keep silent or show specific error
                }
            };

            fetchData();
        }
    }, [isProjectSettingsOpen, currentProject, supabase]);

    useEffect(() => {
        if (isCreatingFolder && newFolderInputRef.current) {
            newFolderInputRef.current.focus();
            newFolderInputRef.current.select();
        }
    }, [isCreatingFolder]);

    // Fetch Whitelist when Creating Project
    useEffect(() => {
        if (isCreatingProject) {
            const fetchWhitelist = async () => {
                setIsLoadingWhitelist(true);
                try {
                    const { data, error } = await supabase.from('whitelist').select('email');
                    if (error) throw error;
                    if (data) setWhitelist(data.map(d => d.email));
                } catch (e) {
                    console.error("Failed to fetch whitelist", e);
                } finally {
                    setIsLoadingWhitelist(false);
                }
            };
            fetchWhitelist();
        }
    }, [isCreatingProject, supabase]);

    const handleDeleteProject = (project: Project) => {
        setDeleteModal({
            isOpen: true,
            title: 'Delete Project',
            message: `WARNING: Are you sure you want to delete project "${project.name}"? This will PERMANENTLY delete all files and folders in this project. This cannot be undone.`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/projects?id=${project.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast("Project deleted successfully", "success");
                        refreshProjects();
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
                } finally {
                    setDeleteModal(prev => ({ ...prev, isOpen: false }));
                }
            },
            isDeleting: false
        });
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
                refreshProjects();
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
                fetchNodes(true);
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


    // Upload Stats
    const [uploadStats, setUploadStats] = useState<{ eta?: string, speed?: string, progress?: number }>({});
    const filesProgressRef = useRef<Map<string, number>>(new Map());
    const batchStatsRef = useRef<{ startTime: number, totalBytes: number }>({ startTime: 0, totalBytes: 0 });
    const lastProgressUpdateRef = useRef<number>(0);

    const updateGlobalProgress = useCallback(() => {
        const now = Date.now();
        if (now - lastProgressUpdateRef.current < 200) return; // Throttle 200ms for smoother feel
        lastProgressUpdateRef.current = now;

        const totalUploaded = Array.from(filesProgressRef.current.values()).reduce((a, b) => a + b, 0);
        const { startTime, totalBytes } = batchStatsRef.current;

        if (totalBytes === 0 || startTime === 0) return;

        // Progress
        const progress = Math.min(100, (totalUploaded / totalBytes) * 100);

        // Speed
        const elapsedSeconds = (now - startTime) / 1000;
        const bytesPerSec = elapsedSeconds > 0 ? totalUploaded / elapsedSeconds : 0;

        // Formatted Speed
        const formatSpeed = (bps: number) => {
            if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
            return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
        };

        // ETA
        const remainingBytes = totalBytes - totalUploaded;
        const secondsRemaining = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;

        const formatTime = (sec: number) => {
            if (!isFinite(sec) || sec < 0) return '--';
            if (sec < 60) return `${Math.ceil(sec)}s`;
            const min = Math.floor(sec / 60);
            if (min < 60) return `${min}m ${Math.ceil(sec % 60)}s`;
            return `${Math.floor(min / 60)}h ${min % 60}m`;
        };

        setUploadStats({
            progress,
            speed: formatSpeed(bytesPerSec),
            eta: formatTime(secondsRemaining)
        });
    }, []);

    // Generic Upload Logic
    const uploadFileToId = async (file: File, parentId: string | null, existingTaskId?: string, resolution?: 'update' | 'overwrite', silent?: boolean): Promise<'SUCCESS' | 'CONFLICT' | 'ERROR' | 'CANCELLED'> => {
        const cleanName = file.name.split('/').pop()?.split('\\').pop() || file.name;
        const taskId = existingTaskId || addTask('UPLOAD', cleanName);

        const uploadDirectly = async (): Promise<'SUCCESS' | 'CONFLICT' | 'ERROR' | 'CANCELLED'> => {
            try {
                // 1. Init Upload (Get Presigned URL)
                const initRes = await fetch('/api/drive/upload/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: cleanName,
                        fileSize: file.size,
                        fileType: file.type,
                        parentId,
                        projectId: currentProject?.id,
                        resolution,
                        silent
                    })
                });

                if (initRes.status === 409) {
                    const conflictData = await initRes.json();
                    if (conflictData.conflict) {
                        setConflictInfo({ file, parentId, taskId, data: conflictData.existing });
                        return 'CONFLICT';
                    }
                }

                if (!initRes.ok) {
                    const err = await initRes.json();
                    throw new Error(err.error || 'Initialization failed');
                }

                const { url, key, resolvedProjectId } = await initRes.json();

                // 2. Direct Upload to R2 (PUT)
                // We use XMLHttpRequest for progress tracking, as fetch doesn't support upload progress yet (in standard)
                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    if (abortControllerRef.current) {
                        abortControllerRef.current.signal.addEventListener('abort', () => xhr.abort());
                    }

                    xhr.open('PUT', url, true);
                    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            filesProgressRef.current.set(taskId, event.loaded);
                            updateGlobalProgress();
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve('SUCCESS');
                        } else {
                            reject(new Error(`Upload failed with status ${xhr.status}`));
                        }
                    };

                    xhr.onerror = () => reject(new Error('Network error during upload'));
                    xhr.onabort = () => reject(new Error('Cancelled'));

                    xhr.send(file);
                });

                filesProgressRef.current.set(taskId, file.size); // Ensure 100%
                updateGlobalProgress();

                // 3. Complete Upload
                const completeRes = await fetch('/api/drive/upload/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key,
                        filename: cleanName,
                        type: file.type,
                        projectId: resolvedProjectId,
                        parentId,
                        resolution,
                        silent
                    })
                });

                if (!completeRes.ok) {
                    const err = await completeRes.json();
                    throw new Error(err.error || 'Completion failed');
                }

                updateTask(taskId, 'SUCCESS');
                if (!silent) {
                    fetchNodes(true);
                    refreshStorage();
                }
                return 'SUCCESS';

            } catch (e: any) {
                if (e.message === 'Cancelled') {
                    updateTask(taskId, 'CANCELLED');
                    return 'CANCELLED';
                }
                console.error(`Upload error for ${cleanName}:`, e);

                // Detailed logging for large files
                if (file.size > 10 * 1024 * 1024) {
                    console.warn(`Large file upload failed. size: ${(file.size / 1024 / 1024).toFixed(2)}MB, error: ${e.message}`);
                }

                updateTask(taskId, 'ERROR');
                return 'ERROR';
            }
        };

        return uploadDirectly();

        /* Legacy Direct Upload Code - Removed for Stability
        try {
            // STEP 1: INITIALIZE (Get Presigned URL)
            const initRes = await fetch('/api/drive/upload/init', { ... }); 
             ... 
        } ...
        */
    };

    const uploadFile = async (file: File) => {
        batchStatsRef.current = { startTime: Date.now(), totalBytes: file.size };
        filesProgressRef.current.clear();
        setUploadStats({}); // Reset UI

        let retries = 3;
        while (retries > 0) {
            try {
                const result = await uploadFileToId(file, currentFolderId);
                if (result === 'SUCCESS' || result === 'CONFLICT' || result === 'CANCELLED') break;
                // If ERROR, we retry
                throw new Error("Upload failed");
            } catch (e) {
                retries--;
                if (retries === 0) {
                    showToast("Failed to upload file after 3 attempts.", "error");
                } else {
                    await new Promise(r => setTimeout(r, 1000 * (4 - retries))); // 1s, 2s...
                }
            }
        }
    }


    const getOrCreateFolder = async (name: string, parentId: string | null, silent?: boolean): Promise<string> => {
        const res = await fetch('/api/drive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'FOLDER', name, parentId, projectId: currentProject?.id, silent })
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

    // Generic Concurrent Upload Helper
    const uploadFilesConcurrent = async (files: File[], parentIdResolver: (file: File) => string | null) => {
        const CONCURRENCY_LIMIT = 3; // Reduced from 5 for better stability with large files
        const pool: Promise<void>[] = [];

        // Initialize Batch Stats if not already set (e.g. by startFolderUpload)
        // If startFolderUpload called this, it might have set it. 
        // We can check if batchStatsRef.current.totalBytes is 0 or if we're starting a new separate batch.
        // For simplicity, let's just add to the current stats if running, or start new.

        const isNewBatch = !isUploadingRef.current || batchStatsRef.current.totalBytes === 0;

        if (isNewBatch) {
            abortControllerRef.current = new AbortController();
            isUploadingRef.current = true;
            const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
            batchStatsRef.current = { startTime: Date.now(), totalBytes };
            filesProgressRef.current.clear();
            setUploadStats({});
        } else {
            // Append stats
            batchStatsRef.current.totalBytes += files.reduce((acc, f) => acc + f.size, 0);
        }

        // Create Tasks globally first (Visual feedback)
        const fileTasks = files.map(file => {
            const cleanName = file.name.split('/').pop()?.split('\\').pop() || file.name;
            const id = uuidv4();
            return { id, file, name: cleanName };
        });

        // Add to UI (Tasks)
        const newUiTasks: AsyncTask[] = fileTasks.map(t => ({
            id: t.id,
            type: 'UPLOAD',
            name: t.name,
            status: 'PENDING'
        }));
        setTasks(prev => [...prev, ...newUiTasks]);

        // Add to UI (Optimistic Nodes)
        const newOptimisticNodes: StorageNode[] = fileTasks.map(t => ({
            id: `optimistic-${t.id}`,
            name: t.name,
            type: 'FILE',
            size: t.file.size,
            updated_at: new Date().toISOString(),
            owner_email: userEmail || 'You',
            parent_id: parentIdResolver(t.file) || currentFolderId,
            project_id: currentProject?.id || '',
            is_trashed: false,
            version: 1,
            created_at: new Date().toISOString(),
            sharing_scope: 'PRIVATE'
        }));
        setOptimisticNodes(prev => [...prev, ...newOptimisticNodes]);

        // Process
        for (let i = 0; i < files.length; i++) {
            if (!isUploadingRef.current) break;

            const file = files[i];
            const taskId = fileTasks[i].id;
            const targetParentId = parentIdResolver(file) || currentFolderId;

            const task = async () => {
                let retries = 3;
                const backoffStart = 1000;
                while (retries > 0) {
                    if (!isUploadingRef.current) break;
                    try {
                        const status = await uploadFileToId(file, targetParentId, taskId, undefined, true);
                        if (status === 'SUCCESS' || status === 'CONFLICT' || status === 'CANCELLED') break;
                    } catch (e) { console.error(e); }

                    retries--;
                    if (retries > 0 && isUploadingRef.current) {
                        await new Promise(r => setTimeout(r, backoffStart * Math.pow(2, 3 - retries - 1)));
                    }
                }
            };

            const p = task().then(() => {
                const idx = pool.indexOf(p);
                if (idx !== -1) pool.splice(idx, 1);
            });
            pool.push(p);

            if (i % 20 === 0) refreshStorage();

            if (pool.length >= CONCURRENCY_LIMIT) {
                await Promise.race(pool);
            }
        }

        await Promise.all(pool);

        if (isNewBatch) {
            isUploadingRef.current = false;
            fetchNodes(true);
            refreshStorage();
            setOptimisticNodes([]);
        }
    };

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

        // 0. Initialize Cancellation & Stats
        abortControllerRef.current = new AbortController();
        isUploadingRef.current = true;

        // Initialize Stats
        const totalBatchBytes = files.reduce((acc, f) => acc + f.size, 0);
        batchStatsRef.current = { startTime: Date.now(), totalBytes: totalBatchBytes };
        filesProgressRef.current.clear();
        setUploadStats({});

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
                        // CRITICAL FIX: Do NOT fallback to currentFolderId if parent is missing.
                        // If 'A/B' exists but we are processing 'A/B/C', we need ID of 'A/B'.
                        // If it's missing (creation failed), we should probably skip this folder to avoid chaos.
                        const foundId = folderIdMap.get(parentPath);
                        if (!foundId) {
                            console.warn(`Skipping folder ${folderPath} because parent ${parentPath} failed to create.`);
                            continue;
                        }
                        realParentId = foundId;
                    }

                    // Loop Retry Logic for folder creation
                    let retries = 3;
                    let folderId = "";
                    while (retries > 0) {
                        try {
                            folderId = await getOrCreateFolder(folderName, realParentId, true);
                            break;
                        } catch (e) {
                            retries--;
                            if (retries === 0) console.error(`Failed to create folder ${folderName} after 3 attempts`);
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }

                    if (folderId) {
                        folderIdMap.set(folderPath, folderId);
                    }
                }
            } catch (folderErr) {
                console.error("Folder creation interrupted", folderErr);
            }

            // 3. Upload files with Concurrency Pool
            // Reuse the new helper
            await uploadFilesConcurrent(files, (file) => {
                const pathParts = file.webkitRelativePath.split('/');
                pathParts.pop();
                const folderPath = pathParts.join('/');
                return folderIdMap.get(folderPath) || currentFolderId;
            });

            // Removed legacy manual pool logic as we use uploadFilesConcurrent now

            // --- SEND SINGLE FOLDER NOTIFICATION ---
            if (isUploadingRef.current && files.length > 0 && currentProject) {
                const rootFolderName = files[0].webkitRelativePath.split('/')[0];
                fetch('/api/projects/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: currentProject.id,
                        action: 'UPLOADED',
                        fileName: rootFolderName
                    })
                }).catch(e => console.error("Folder notification failed", e));
            }

            isUploadingRef.current = false;
            fetchNodes(true);
            refreshStorage();
            setPendingFolderUpload(null);
        } catch (err: any) {
            console.error(err);
            showToast('Error creating folder structure', 'error');
        } finally {
            isUploadingRef.current = false;
            setPendingFolderUpload(null);
            abortControllerRef.current = null;
        }
    };

    const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawFiles = e.target.files;
        if (!rawFiles || rawFiles.length === 0) return;
        const files = Array.from(rawFiles);
        await uploadFilesConcurrent(files, () => currentFolderId);
        e.target.value = '';
    };

    const handleSaveNote = async (name: string, content: string) => {
        const file = new File([content], name, { type: 'text/plain' });

        if (editingNode) {
            // Update existing file (creates new version)
            // We create a temporary task ID to track this update
            const taskId = uuidv4();
            setTasks(prev => [...prev, { id: taskId, type: 'UPLOAD', name: name, status: 'PENDING' }]);

            await uploadFileToId(file, editingNode.parent_id, taskId, 'update');
            setEditingNode(null);
            setEditInitialContent("");
        } else {
            // New file
            await uploadFile(file);
        }
    };



    // Shared Deletion Logic
    const handleDelete = (node: StorageNode) => {
        const itemType = node.type === 'FOLDER' ? 'folder' : 'file';
        setDeleteModal({
            isOpen: true,
            title: `Delete ${itemType === 'folder' ? 'Folder' : 'File'}`,
            message: `Are you sure you want to move "${node.name}" to trash?`,
            onConfirm: async () => {
                const taskId = addTask('DELETE', node.name);
                try {
                    const res = await fetch(`/api/drive?id=${node.id}&project=${currentProject?.id}`, { method: 'DELETE' });

                    if (res.ok) {
                        updateTask(taskId, 'SUCCESS');
                        fetchNodes(true);
                        refreshStorage();
                        showToast(`${itemType === 'folder' ? 'Folder' : 'File'} moved to trash`, 'success');
                    } else {
                        throw new Error('Failed to delete');
                    }
                } catch (err) {
                    updateTask(taskId, 'ERROR');
                    showToast(`Error deleting ${node.name}`, 'error');
                } finally {
                    setDeleteModal(prev => ({ ...prev, isOpen: false }));
                }
            },
            isDeleting: false
        });
    };

    const confirmDeleteExecute = async () => { }; // Deprecated, kept for interface safety if referenced elsewhere temporarily

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

    // Recursive File/Folder Traversal
    const traverseFileTree = async (item: any, path: string = ""): Promise<File[]> => {
        if (item.isFile) {
            return new Promise((resolve) => {
                item.file((file: File) => {
                    const fullPath = path ? path + "/" + file.name : file.name;
                    // Monkey patch webkitRelativePath for folder structure preservation
                    Object.defineProperty(file, 'webkitRelativePath', {
                        value: fullPath,
                        writable: false
                    });
                    resolve([file]);
                });
            });
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            let entries: any[] = [];

            try {
                const readBatch = async () => {
                    return new Promise<any[]>((resolve, reject) => {
                        dirReader.readEntries(resolve, reject);
                    });
                };

                let batch: any[] = [];
                do {
                    batch = await readBatch();
                    entries = entries.concat(batch);
                } while (batch.length > 0);
            } catch (e) {
                console.error("Error reading directory", e);
            }

            let files: File[] = [];
            for (const entry of entries) {
                const subFiles = await traverseFileTree(entry, path ? path + "/" + item.name : item.name);
                files = [...files, ...subFiles];
            }
            return files;
        }
        return [];
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        // If dragging internal node, ignore main drop area (Move happens in row onDrop)
        if (draggedNode) return;

        const items = e.dataTransfer.items;

        // Advanced Folder/File Drop Support
        if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
            const entries = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    const entry = items[i].webkitGetAsEntry();
                    if (entry) entries.push(entry);
                }
            }

            if (entries.length > 0) {
                showToast("Processing files...", "info");
                const allFiles: File[] = [];

                for (const entry of entries) {
                    const files = await traverseFileTree(entry);
                    allFiles.push(...files);
                }

                if (allFiles.length > 0) {
                    const totalSize = allFiles.reduce((acc, file) => acc + file.size, 0);
                    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2) + ' MB';

                    setPendingFolderUpload(allFiles);
                    setPendingFolderStats({ count: allFiles.length, size: sizeMB });
                    setIsFolderUploadModalOpen(true);
                }
                return;
            }
        }

        // Simple Drop fallback
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            await uploadFilesConcurrent(files, () => currentFolderId);
            fetchNodes(true);
            refreshStorage();
        }
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
            if (breadcrumbsToRender.length > 0) {
                const newPathKeys = breadcrumbsToRender.slice(0, index + 1).map(f => f.name);
                router.push(`/drive/${projectKey}/${newPathKeys.join('/')}`);
            }
        }
    };

    // Sharing Top Bar
    // Sharing Top Bar
    const handleShareClick = async () => {
        let targetId = null;
        if (selectedNodeIds.size === 1) {
            targetId = Array.from(selectedNodeIds)[0];
        } else {
            targetId = currentFolderId;
        }

        if (!targetId) {
            showToast("Cannot share root drive. Please select a file or enter a folder.", 'error');
            return;
        }

        await openShareModalForNode(targetId);
    };

    const handleRenameSubmit = async () => {
        if (!nodeToRename || !renameValue.trim()) return;
        setIsRenaming(true);

        try {
            const res = await fetch('/api/drive', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: nodeToRename.id,
                    name: renameValue.trim()
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to rename");
            }

            showToast("Renamed successfully", "success");
            setIsRenameModalOpen(false);
            fetchNodes(true); // Refresh list
        } catch (e: any) {
            console.error(e);
            showToast(e.message || "Failed to rename", "error");
        } finally {
            setIsRenaming(false);
        }
    };

    // Auto focus rename input
    const renameInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (isRenameModalOpen && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isRenameModalOpen]);

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

    const handleSearchContextMenu = (e: React.MouseEvent, node: StorageNode) => {
        e.preventDefault();
        e.stopPropagation();
        setSearchContextMenu({ x: e.clientX, y: e.clientY, node });
    };

    const handleOpenFileLocation = (node: StorageNode) => {
        // Path Tokens is added by the backend now
        const tokens = (node as any).path_tokens || [];
        const projectId = currentProject?.id;

        // We need to route to /drive/PROJECT_NAME/path/to/folder
        // BUT current routing uses SLUG which starts with Project ID or Name?
        // Let's check `urlProjectId`. It matches `slug[0]`.
        // If we are already in the project, we can just use `urlProjectId`.

        if (!projectId || !urlProjectId) return;

        // Construct path
        // The URL pattern is /drive/[projectId]/[folder1]/[folder2]
        const path = tokens.map((t: string) => encodeURIComponent(t)).join('/');
        const url = `/drive/${urlProjectId}/${path}`;

        router.push(url);
        setSearchQuery(""); // Close search
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
                            {isAdmin && (
                                <div
                                    onClick={() => setIsCreatingProject(true)}
                                    className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors min-h-[200px]"
                                >
                                    <Plus className="w-8 h-8 mb-2" />
                                    <span className="font-semibold">Create New Project</span>
                                </div>
                            )}
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
                        <div className="mb-6 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <button onClick={() => { setCurrentProject(null); router.push('/drive'); }} className="text-slate-400 hover:text-slate-700 transition-colors">
                                    <span className="text-sm">← Projects</span>
                                </button>
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                                    {currentProject!.name}
                                    {currentProject?.settings?.read_only && (
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm animate-pulse">
                                            <Lock className="w-3 h-3" />
                                            Read Only
                                        </span>
                                    )}
                                    {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                                </h2>
                            </div>

                            {/* Search Bar */}
                            <div className="flex-1 max-w-md relative" ref={searchRef}>
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder={`Search in ${currentProject!.name}...`}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                    />
                                    {isSearching && (
                                        <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />
                                    )}
                                </div>

                                {/* Search Results Dropdown */}
                                {searchQuery && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-[400px] overflow-y-auto z-[70] animate-in fade-in zoom-in-95 duration-200">
                                        {searchResults.length === 0 && !isSearching ? (
                                            <div className="p-4 text-center text-slate-500 text-sm">No results found</div>
                                        ) : (
                                            <div className="py-2">
                                                {searchResults.map(result => (
                                                    <div
                                                        key={result.id}
                                                        onClick={() => {
                                                            if (result.type === 'FOLDER') {
                                                                handleOpenFileLocation(result);
                                                            } else {
                                                                handlePreview(result);
                                                                setSearchQuery(""); // Close search if opening preview
                                                            }
                                                        }}
                                                        onContextMenu={(e) => handleSearchContextMenu(e, result)}
                                                        className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex items-center gap-3 border-b border-slate-50 last:border-0"
                                                    >
                                                        {result.type === 'FOLDER' ? (
                                                            <Folder className="w-5 h-5 text-indigo-500" />
                                                        ) : (
                                                            <FileText className="w-5 h-5 text-blue-500" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-slate-800 truncate match-highlight">{result.name}</p>
                                                            <p className="text-xs text-slate-400 capitalize">{result.type.toLowerCase()} · {(result.type === 'FOLDER' ? (result as any).path_tokens?.join('/') : (result as any).path_tokens?.join('/') + '/' + result.name)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {(isAdmin || currentProject?.created_by === userId) && (
                                    <button
                                        onClick={async () => {
                                            const res = await fetch(`/api/projects/settings?projectId=${currentProject?.id}`);
                                            if (res.ok) {
                                                const data = await res.json();
                                                setProjectSettings(data);
                                                setIsProjectSettingsOpen(true);
                                            }
                                        }}
                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-all"
                                        title="Project Settings"
                                    >
                                        <Settings className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
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



                        <DriveToolbar
                            currentProject={currentProject}
                            currentFolderId={currentFolderId}
                            selectedNodeIds={selectedNodeIds}
                            isAdmin={isAdmin}
                            userId={userId}
                            userEmail={userEmail}
                            slug={slug}
                            breadcrumbsToRender={breadcrumbsToRender}
                            isDownloading={isDownloading}
                            isUploadMenuOpen={isUploadMenuOpen}
                            setIsUploadMenuOpen={setIsUploadMenuOpen}
                            draggedNode={draggedNode}
                            setDraggedNode={setDraggedNode}
                            setSelectedNodeIds={setSelectedNodeIds}
                            handleShareClick={handleShareClick}
                            handleMainDownload={handleMainDownload}
                            handleCreateFolderClick={handleCreateFolderClick}
                            setIsCreateNoteModalOpen={setIsCreateNoteModalOpen}
                            handleCreatePlannerClick={handleCreatePlannerClick}
                            triggerFolderUploadSelection={triggerFolderUploadSelection}
                            fileInputRef={fileInputRef}
                            navigateUp={navigateUp}
                            handleMoveNode={handleMoveNode}
                            nodes={nodes}
                        />


                        <DriveNodesList
                            nodes={nodes}
                            sortedNodes={sortedNodes}
                            loading={folderLoading}
                            isAdmin={isAdmin}
                            userEmail={userEmail}
                            selectedNodeIds={selectedNodeIds}
                            dragOverNodeId={dragOverNodeId}
                            draggedNode={draggedNode}
                            sortConfig={sortConfig}
                            isCreatingFolder={isCreatingFolder}
                            newFolderName={newFolderName}
                            newFolderInputRef={newFolderInputRef}
                            fileInputRef={fileInputRef}
                            toggleSelectAll={toggleSelectAll}
                            handleSort={handleSort}
                            setNewFolderName={setNewFolderName}
                            handleNewFolderKeyDown={handleNewFolderKeyDown}
                            confirmCreateFolder={confirmCreateFolder}
                            navigateToFolder={navigateToFolder}
                            handlePreview={handlePreview}
                            handleContextMenu={handleContextMenu}
                            toggleNodeSelection={toggleNodeSelection}
                            handleCreateFolderClick={handleCreateFolderClick}
                            setDraggedNode={setDraggedNode}
                            setDragOverNodeId={setDragOverNodeId}
                            handleMoveNode={handleMoveNode}
                            setSelectedNodeIds={setSelectedNodeIds}
                            showToast={showToast}
                            prefetchFolder={prefetchFolder}
                            loadMore={loadMore}
                            hasMore={hasMore}
                            isFetchingMore={isFetchingMore}
                        />

                    </>
                )}
            </main>

            {/* Bulk Actions Bar */}
            {
                selectedNodeIds.size > 0 && (
                    <div className="fixed bottom-6 left-[50%] translate-x-[-40%] z-50 bg-slate-900 text-white rounded-full px-6 py-3 shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-6 fade-in duration-300">
                        <span className="text-sm font-medium border-r border-slate-700 pr-4">
                            {selectedNodeIds.size} selected
                        </span>

                        <button
                            onClick={handleBulkDownload}
                            className="flex items-center gap-2 text-sm hover:text-blue-400 transition-colors"
                            disabled={isDownloading}
                        >
                            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Download
                        </button>

                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center gap-2 text-sm hover:text-red-400 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>

                        <button
                            onClick={() => setSelectedNodeIds(new Set())}
                            className="ml-2 hover:bg-slate-800 p-1 rounded-full transition-colors"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>
                )
            }

            <DrivePreviewModal
                previewNode={previewNode}
                previewContent={previewContent}
                loadingPreview={loadingPreview}
                isAdmin={isAdmin}
                userEmail={userEmail}
                closePreview={closePreview}
                setEditingNode={setEditingNode}
                setEditInitialContent={setEditInitialContent}
                setIsCreateNoteModalOpen={setIsCreateNoteModalOpen}
            />



            {/* Search Context Menu */}
            {
                searchContextMenu && (
                    <div
                        className="fixed z-[100] w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 animate-in fade-in zoom-in-95 duration-100"
                        style={{ top: searchContextMenu.y, left: searchContextMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => {
                                if (searchContextMenu.node.type === 'FOLDER') {
                                    const tokens = (searchContextMenu.node as any).path_tokens || [];
                                    const fullPath = [...tokens, searchContextMenu.node.name];
                                    const url = `/drive/${urlProjectId}/${fullPath.map((t: string) => encodeURIComponent(t)).join('/')}`;
                                    router.push(url);
                                    setSearchQuery("");
                                } else {
                                    handlePreview(searchContextMenu.node);
                                    setSearchQuery("");
                                }
                                setSearchContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                        >
                            {searchContextMenu.node.type === 'FOLDER' ? <Folder className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                            Open
                        </button>
                        {searchContextMenu.node.type === 'FILE' && (
                            <button
                                onClick={() => {
                                    handleOpenFileLocation(searchContextMenu.node);
                                    setSearchContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                            >
                                <ArrowUpCircle className="w-4 h-4" />
                                Open File Location
                            </button>
                        )}
                    </div>
                )
            }
            {
                isFolderUploadModalOpen && (
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
                )
            }

            {/* Create Project Modal */}
            {
                isCreatingProject && (
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
                                            {isLoadingWhitelist ? (
                                                <div className="flex items-center justify-center p-4">
                                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                                    <span className="ml-2 text-xs text-slate-400">Loading users...</span>
                                                </div>
                                            ) : whitelist.length === 0 ? (
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
                )
            }

            {
                isRenameModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform">
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-slate-800 mb-4">Rename Item</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                                    <input
                                        ref={renameInputRef}
                                        type="text"
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameSubmit();
                                            if (e.key === 'Escape') setIsRenameModalOpen(false);
                                        }}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setIsRenameModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRenameSubmit}
                                    disabled={isRenaming}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isRenaming && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Rename
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                deleteModal.isOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 z-[110] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 bg-red-50 text-red-600 rounded-full">
                                    <AlertCircle className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">{deleteModal.title}</h3>
                            </div>

                            <p className="text-slate-600 mb-8 leading-relaxed">
                                {deleteModal.message}
                            </p>

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                                    className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setDeleteModal(prev => ({ ...prev, isDeleting: true }));
                                        deleteModal.onConfirm();
                                    }}
                                    disabled={deleteModal.isDeleting}
                                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-200 transition-all transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {deleteModal.isDeleting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            Delete
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Share Modal */}
            {
                isShareModalOpen && (
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
                )
            }

            <TaskProgress
                tasks={tasks}
                onClearCompleted={clearCompletedTasks}
                onStop={isUploadingRef.current ? handleStopUpload : undefined}
                eta={uploadStats.eta}
                speed={uploadStats.speed}
                overallProgress={uploadStats.progress}
            />

            {/* Context Menu */}
            {
                contextMenu && (
                    <div
                        className="fixed bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-[100] min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
                        style={{
                            top: contextMenu.y > window.innerHeight - 280 ? 'auto' : contextMenu.y,
                            bottom: contextMenu.y > window.innerHeight - 280 ? window.innerHeight - contextMenu.y : 'auto',
                            left: contextMenu.x > window.innerWidth - 200 ? 'auto' : contextMenu.x,
                            right: contextMenu.x > window.innerWidth - 200 ? window.innerWidth - contextMenu.x : 'auto'
                        }}
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

                        {isAdmin || (contextMenu.node.owner_email === userEmail) ? (
                            <button
                                onClick={() => {
                                    setNodeToRename(contextMenu.node);
                                    setRenameValue(contextMenu.node.name);
                                    setIsRenameModalOpen(true);
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"
                            >
                                <Pencil className="w-4 h-4 text-slate-500" />
                                Rename
                            </button>
                        ) : null}

                        {/* Move To */}
                        {(isAdmin || contextMenu.node.owner_email === userEmail) && (
                            <button
                                onClick={() => {
                                    if (selectedNodeIds.has(contextMenu.node.id)) {
                                        setNodesToMove(nodes.filter(n => selectedNodeIds.has(n.id)));
                                    } else {
                                        setNodesToMove([contextMenu.node]);
                                    }
                                    setIsMoveToModalOpen(true);
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                            >
                                <FolderUp className="w-4 h-4 text-slate-500" />
                                Move to...
                            </button>
                        )}

                        {/* Get Info */}
                        <button
                            onClick={() => {
                                setInfoPanelNode(contextMenu.node);
                                setIsInfoPanelOpen(true);
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                        >
                            <Info className="w-4 h-4 text-slate-500" />
                            Get Info
                        </button>

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

                        {currentProject?.settings?.read_only && !isAdmin ? (
                            <div className="px-4 py-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2 italic">
                                <Lock className="w-3 h-3" />
                                Read Only Active
                            </div>
                        ) : (
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
                        )}
                    </div>
                )
            }
            {/* Version History Modal */}
            {
                isVersionHistoryOpen && selectedHistoryNode && (
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
                                    {versionNodes.map((v, idx) => {
                                        const isPurged = !v.r2_key;
                                        return (
                                            <div key={v.id} className={`flex items-center justify-between p-4 rounded-xl border ${idx === 0 ? 'bg-blue-50/30 border-blue-100 ring-1 ring-blue-100' : 'border-slate-100 hover:bg-slate-50'} ${isPurged ? 'opacity-50 saturate-0' : ''} transition-all`}>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${idx === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                            v{v.version}
                                                        </span>
                                                        {idx === 0 && <span className="text-[9px] text-blue-600 font-bold mt-1 uppercase">Active</span>}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-semibold text-slate-800">
                                                                {format(new Date(v.updated_at), 'MMM d, yyyy · HH:mm')}
                                                            </p>
                                                            {isPurged && <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 font-bold uppercase tracking-tighter">Purged</span>}
                                                        </div>
                                                        <p className="text-xs text-slate-500 flex items-center gap-2">
                                                            <span>{(v.size! / 1024).toFixed(1)} KB</span>
                                                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                            <span>{v.owner_email?.split('@')[0]}</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => !isPurged && window.open(`/api/files/${encodeURIComponent(v.r2_key!)}?filename=${encodeURIComponent(v.name)}`)}
                                                        disabled={isPurged}
                                                        className={`p-2 rounded-lg transition-all ${isPurged ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                                        title={isPurged ? "File content has been purged per project policy" : "Download this version"}
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>

                                                    {idx !== 0 && (
                                                        <button
                                                            onClick={() => !isPurged && handleRollback(v)}
                                                            disabled={isRollingBack || isPurged}
                                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${isPurged
                                                                ? 'text-slate-300 border-slate-100 bg-slate-50 cursor-not-allowed'
                                                                : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 disabled:opacity-50'
                                                                }`}
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                            Roll Back
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
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
                )
            }

            {/* Conflict Modal */}
            {
                conflictInfo && (
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
                )
            }

            {/* Project Settings Modal */}
            {
                isProjectSettingsOpen && currentProject && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-blue-600" />
                                    <h3 className="text-lg font-bold text-slate-900">Project Settings</h3>
                                </div>
                                <button onClick={() => setIsProjectSettingsOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-slate-100">
                                <button
                                    onClick={() => setSettingsTab('general')}
                                    className={`flex-1 py-3 text-sm font-bold text-center transition-colors relative ${settingsTab === 'general' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    General
                                    {settingsTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
                                </button>
                                <button
                                    onClick={() => setSettingsTab('members')}
                                    className={`flex-1 py-3 text-sm font-bold text-center transition-colors relative ${settingsTab === 'members' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Members
                                    {settingsTab === 'members' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
                                </button>
                            </div>

                            <div className="p-8">
                                {settingsTab === 'general' ? (
                                    <>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Advanced Notifications</h4>

                                        <div className="flex items-start justify-between gap-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100 mb-8">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Cloud className="w-4 h-4 text-blue-600" />
                                                    <span className="font-bold text-slate-800 text-sm">Activity Email Notifications</span>
                                                </div>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    Send email alerts to the Project Owner whenever members upload or delete files.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setProjectSettings(prev => ({ ...prev, notify_on_activity: !prev.notify_on_activity }))}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${projectSettings.notify_on_activity ? 'bg-blue-600' : 'bg-slate-300'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${projectSettings.notify_on_activity ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </div>

                                        <div className="mb-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
                                                <History className="w-4 h-4 text-slate-400" />
                                                Version Retention Limit
                                            </label>
                                            <p className="text-[11px] text-slate-500 mb-3 leading-tight">
                                                Maximum number of versions to keep per file. Older versions will be purged from storage (still visible in history but not downloadable).
                                            </p>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    placeholder="0 = Unlimited"
                                                    value={projectSettings.version_retention_limit || ''}
                                                    onChange={(e) => setProjectSettings(prev => ({ ...prev, version_retention_limit: parseInt(e.target.value) || 0 }))}
                                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-semibold"
                                                />
                                                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Versions</span>
                                            </div>
                                        </div>

                                        <div className="mb-6 flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100">
                                            <div>
                                                <label className="text-sm font-bold text-amber-900 flex items-center gap-2">
                                                    <Lock className="w-4 h-4" />
                                                    Read-Only Mode
                                                </label>
                                                <p className="text-[11px] text-amber-700 leading-tight mt-1">
                                                    Prevent all users (except Admins) from uploading, deleting, or modifying files in this project.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setProjectSettings(prev => ({ ...prev, read_only: !prev.read_only }))}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${projectSettings.read_only ? 'bg-amber-600' : 'bg-slate-300'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${projectSettings.read_only ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex gap-2 mb-4">
                                            <select
                                                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        if (!projectMembers.includes(e.target.value)) {
                                                            setProjectMembers(prev => [...prev, e.target.value]);
                                                        }
                                                        e.target.value = ""; // Reset
                                                    }
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>Add member...</option>
                                                {whitelist
                                                    .filter(email => !projectMembers.includes(email) && email !== currentProject.created_by)
                                                    .map(email => (
                                                        <option key={email} value={email}>{email}</option>
                                                    ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                            {/* Owner always shown */}
                                            <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                                                        {currentProject.created_by?.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800">{currentProject.created_by}</p>
                                                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase">Owner</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {projectMembers.map((member) => (
                                                <div key={member} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                                            {member.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <p className="text-sm font-medium text-slate-700">{member}</p>
                                                    </div>
                                                    {member !== userEmail && (
                                                        <button
                                                            onClick={() => {
                                                                setDeleteModal({
                                                                    isOpen: true,
                                                                    title: 'Remove Member',
                                                                    message: `Are you sure you want to remove ${member} from this project?`,
                                                                    onConfirm: async () => {
                                                                        setProjectMembers(prev => prev.filter(m => m !== member));
                                                                        setDeleteModal(prev => ({ ...prev, isOpen: false }));
                                                                    },
                                                                    isDeleting: false
                                                                });
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Remove member"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {member === userEmail && (
                                                        <span className="text-[10px] text-slate-400 italic px-2">It's you</span>
                                                    )}
                                                </div>
                                            ))}

                                            {projectMembers.length === 0 && (
                                                <div className="text-center py-8 text-slate-400 text-sm">
                                                    No additional members
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => setIsProjectSettingsOpen(false)}
                                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={isSavingSettings}
                                        onClick={async () => {
                                            setIsSavingSettings(true);
                                            try {
                                                // Sending flattened structure as per new API design
                                                const payload = {
                                                    id: currentProject.id, // API expects 'id' in body or uses param? PATCH route uses body.id
                                                    notify_on_activity: projectSettings.notify_on_activity,
                                                    version_retention_limit: projectSettings.version_retention_limit,
                                                    read_only: projectSettings.read_only,
                                                    members: projectMembers
                                                };

                                                const res = await fetch('/api/projects', { // Endpoint changed to /api/projects for PATCH
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify(payload)
                                                });

                                                if (res.ok) {
                                                    showToast("Settings saved successfully", "success");
                                                    // Update local state deeply
                                                    setCurrentProject(prev => {
                                                        if (!prev) return null;
                                                        return {
                                                            ...prev,
                                                            settings: projectSettings, // Maintain nested structure for local usage
                                                            members: projectMembers
                                                        };
                                                    });
                                                    setIsProjectSettingsOpen(false);
                                                } else {
                                                    const err = await res.json();
                                                    throw new Error(err.error || "Failed to save settings");
                                                }
                                            } catch (e: any) {
                                                console.error(e);
                                                showToast(e.message || "Failed to save settings", "error");
                                            } finally {
                                                setIsSavingSettings(false);
                                            }
                                        }}
                                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Overlay */}
            <ConfirmModal
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={confirmDeleteExecute}
                title={`Delete ${itemToDelete?.type === 'FOLDER' ? 'Folder' : 'File'}?`}
                description={
                    <>
                        Are you sure you want to delete <span className="font-bold text-slate-800">"{itemToDelete?.name}"</span>?
                        {itemToDelete?.type === 'FOLDER' && (
                            <span className="block mt-2 font-semibold text-red-600 text-[11px] uppercase tracking-wider">
                                This will also delete ALL contents!
                            </span>
                        )}
                        <br />
                        <span className="text-[10px] opacity-70 mt-2 block">This action cannot be undone.</span>
                    </>
                }
                confirmText="Delete Permanently"
                isDanger
            />

            {/* Rollback Confirmation Overlay */}
            <ConfirmModal
                isOpen={!!pendingRollback}
                onClose={() => setPendingRollback(null)}
                onConfirm={confirmRollbackExecute}
                title="Confirm Rollback"
                description={
                    <>
                        Are you sure you want to restore <span className="font-bold text-slate-800">"{selectedHistoryNode?.name}"</span> to <span className="text-blue-600 font-bold underline">version {pendingRollback?.version}</span>?
                        <br />
                        <span className="text-[10px] opacity-70 mt-2 block">(This will create a new version copy)</span>
                    </>
                }
                confirmText="Confirm Restore"
                isDanger={false}
            />
            {/* Create Note Modal */}
            <CreateNoteModal
                isOpen={isCreateNoteModalOpen}
                onClose={() => {
                    setIsCreateNoteModalOpen(false);
                    setEditingNode(null);
                    setEditInitialContent("");
                }}
                onCreate={handleSaveNote}
                initialName={editingNode?.name}
                initialContent={editInitialContent}
            />

            {/* Move Modal */}
            <MoveToModal
                isOpen={isMoveToModalOpen}
                onClose={() => setIsMoveToModalOpen(false)}
                nodesToMove={nodesToMove}
                projectId={currentProject?.id || ''}
                onMove={async (targetId: string | null) => {
                    // Handle move
                    for (const node of nodesToMove) {
                        await handleMoveNode(node, targetId);
                    }
                    showToast(`Moved ${nodesToMove.length} item(s)`, "success");
                }}
            />

            {/* Info Panel */}
            <FileInfoPanel
                node={infoPanelNode}
                isOpen={isInfoPanelOpen}
                onClose={() => setIsInfoPanelOpen(false)}
            />

            {/* Planner Editor */}
            <PlannerEditor
                isOpen={plannerState.isOpen}
                onClose={() => setPlannerState({ isOpen: false, file: null, content: null })}
                initialData={plannerState.content}
                fileName={plannerState.file?.name || ''}
                onSave={handleSavePlanner}
            />

            <InputModal
                isOpen={isCreatePlannerModalOpen}
                onClose={() => setIsCreatePlannerModalOpen(false)}
                onSubmit={handleCreatePlannerSubmit}
                title="Create New Planner"
                description="Enter a name for your new project plan."
                placeholder="Ex. Project Alpha Plan"
                confirmText="Create Plan"
            />
        </div>
    );
}
