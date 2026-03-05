'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './FileManager.module.css';
import {
    fetchNodes,
    createFolderFolder,
    getUploadPresignedUrl,
    saveFileRecord,
    deleteNode,
    getDownloadUrl,
    createShareLink,
    ensurePathExists,
    getNodeShareLinks,
    revokeShareLink,
    fetchRecentNodes,
    getMyRoleInProject,
    getFolderPath,
    renameNode,
    moveNode,
    fetchProject,
    logDownload,
    getPreviewUrl
} from '@/app/actions';
import FilePreviewModal from '@/components/FilePreviewModal';
import {
    FolderPlus, UploadCloud, Folder, File,
    Trash2, ArrowLeft, DownloadCloud, FileText, Image as ImageIcon, Video, Archive, Share2, Copy, Link as LinkIcon, ExternalLink, Edit2, MoveRight, ChevronRight, CheckSquare, Square
} from 'lucide-react';
import type { DriveNode } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';

export default function FileManager() {
    const [nodes, setNodes] = useState<DriveNode[]>([]);
    const [currentFolder, setCurrentFolder] = useState<{ id: string | null, name: string }>({ id: null, name: 'Root' });
    const [folderHistory, setFolderHistory] = useState<{ id: string | null, name: string }[]>([]);

    const searchParams = useSearchParams();
    const router = useRouter();
    const { showToast, showConfirm } = useToast();
    const initialLoadDone = useRef(false);
    const lastUrlState = useRef<{ projectId: string | null, folderId: string | null, search: string | null, recent: boolean }>({
        projectId: undefined as any, folderId: undefined as any, search: undefined as any, recent: undefined as any
    });

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: DriveNode } | null>(null);

    const [loading, setLoading] = useState(true);
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renameNodeData, setRenameNodeData] = useState<DriveNode | null>(null);
    const [editName, setEditName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [projectRole, setProjectRole] = useState<'admin' | 'member' | 'read_only'>('read_only');
    const [projectName, setProjectName] = useState('Workspace');

    // Drag-and-drop upload state
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounter = useRef(0); // track nested drag enter/leave

    // File Preview
    const [previewNode, setPreviewNode] = useState<DriveNode | null>(null);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Move Node States
    const [moveNodeData, setMoveNodeData] = useState<DriveNode | null>(null);
    const [moveModalFolderHistory, setMoveModalFolderHistory] = useState<{ id: string | null, name: string }[]>([]);
    const [moveModalCurrentFolder, setMoveModalCurrentFolder] = useState<{ id: string | null, name: string }>({ id: null, name: 'Root' });
    const [moveModalNodes, setMoveModalNodes] = useState<DriveNode[]>([]);
    const [isMovingLoading, setIsMovingLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // Pending Folder Upload State
    const [pendingFolderUpload, setPendingFolderUpload] = useState<{
        files: File[],
        folderName: string,
        totalSize: number
    } | null>(null);

    // Share Modal States
    const [shareNode, setShareNode] = useState<DriveNode | null>(null);
    const [sharePassword, setSharePassword] = useState('');
    const [expiresInDays, setExpiresInDays] = useState('0');
    const [activeLinks, setActiveLinks] = useState<{ id: string, created_at: string, expires_at: string | null }[]>([]);
    const [isSharing, setIsSharing] = useState(false);
    const [generatedLink, setGeneratedLink] = useState('');

    type TransferTask = { id: string, name: string, type: string, progress: number, status: 'running' | 'completed' | 'error' };
    const [transfers, setTransfers] = useState<TransferTask[]>([]);
    const [showTransfers, setShowTransfers] = useState(false);

    const addTransfer = (id: string, name: string, type: string) => {
        setTransfers(prev => [{ id, name, type, progress: 0, status: 'running' }, ...prev]);
        setShowTransfers(true);
    };
    const updateTransfer = (id: string, progress: number) => {
        setTransfers(prev => prev.map(t => t.id === id ? { ...t, progress } : t));
    };
    const completeTransfer = (id: string, status: 'completed' | 'error') => {
        setTransfers(prev => prev.map(t => t.id === id ? { ...t, progress: status === 'completed' ? 100 : t.progress, status } : t));
    };

    const loadData = async (parentId = currentFolder.id, searchQuery?: string, isRecent?: boolean) => {
        setLoading(true);
        const projectId = searchParams?.get('projectId') || undefined;
        try {
            if (isRecent) {
                const data = await fetchRecentNodes(projectId);
                setNodes(data || []);
            } else {
                const data = await fetchNodes(parentId, searchQuery, projectId);
                setNodes(data || []);
            }
        } catch (e) {
            console.error(e);
            // Fallback: If network fails we can handle graceful error
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const initFromUrl = async () => {
            const folderId = searchParams?.get('folderId') || null;
            const searchQ = searchParams?.get('search') || null;
            const isRecent = searchParams?.get('recent') === 'true';
            const projectId = searchParams?.get('projectId') || null;

            const isProjectChanged = lastUrlState.current.projectId !== projectId;
            const isFolderChanged = lastUrlState.current.folderId !== folderId;
            const isSearchChanged = lastUrlState.current.search !== searchQ;
            const isRecentChanged = lastUrlState.current.recent !== isRecent;

            if (!isProjectChanged && !isFolderChanged && !isSearchChanged && !isRecentChanged && initialLoadDone.current) {
                return;
            }
            lastUrlState.current = { projectId, folderId, search: searchQ, recent: isRecent };

            if (isProjectChanged || !initialLoadDone.current) {
                if (projectId) {
                    fetchProject(projectId).then(proj => { if (proj) setProjectName(proj.name); });
                    getMyRoleInProject(projectId).then(role => setProjectRole(role as 'admin' | 'member' | 'read_only'));
                } else {
                    setProjectName('Workspace');
                    setProjectRole('read_only');
                }
            }

            if (isRecent) {
                setFolderHistory([]);
                setCurrentFolder({ id: null, name: 'Root' });
            } else if (folderId && (!initialLoadDone.current || folderId !== currentFolder.id)) {
                try {
                    const { history, currentFolder: cf } = await getFolderPath(folderId);
                    setFolderHistory(history);
                    setCurrentFolder(cf);
                } catch (e) {
                    console.error('Failed to load folder path', e);
                }
            } else if (!folderId && (!initialLoadDone.current || currentFolder.id !== null)) {
                setFolderHistory([]);
                setCurrentFolder({ id: null, name: 'Root' });
            }

            initialLoadDone.current = true;
            loadData(isRecent ? null : folderId, searchQ || undefined, isRecent);
        };
        initFromUrl();
    }, [searchParams]);

    const isGlobalRoot = !searchParams?.get('projectId') && !searchParams?.get('folderId') && !searchParams?.get('search') && !searchParams?.get('recent');

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const projectId = searchParams?.get('projectId') || undefined;
        try {
            await createFolderFolder(newFolderName, currentFolder.id, projectId);
            setNewFolderName('');
            setShowFolderModal(false);
            loadData();
        } catch (err) {
            console.error(err);
            showToast('Create folder failed', 'error');
        }
    };

    const handleRenameNode = async () => {
        if (!renameNodeData || !editName.trim() || editName === renameNodeData.name) {
            setRenameNodeData(null);
            return;
        }
        try {
            await renameNode(renameNodeData.id, editName);
            showToast(`Renamed to ${editName}`, 'success');
            setRenameNodeData(null);
            loadData();
        } catch (err) {
            console.error(err);
            showToast('Rename failed', 'error');
        }
    };

    const loadMoveModalData = async (parentId = moveModalCurrentFolder.id) => {
        setIsMovingLoading(true);
        const projectId = searchParams?.get('projectId') || undefined;
        try {
            const data = await fetchNodes(parentId, '', projectId);
            const foldersOnly = (data || []).filter(n => n.type === 'folder' && n.id !== moveNodeData?.id);
            setMoveModalNodes(foldersOnly);
        } catch (e) {
            console.error(e);
        } finally {
            setIsMovingLoading(false);
        }
    };

    useEffect(() => {
        if (moveNodeData) {
            setMoveModalCurrentFolder({ id: null, name: 'Root' });
            setMoveModalFolderHistory([]);
            loadMoveModalData(null);
        }
    }, [moveNodeData]);

    const submitMove = async (targetFolderId: string | null) => {
        if (!moveNodeData) return;
        try {
            await moveNode(moveNodeData.id, targetFolderId);
            showToast('Moved successfully', 'success');
            setMoveNodeData(null);
            loadData();
        } catch (err: any) {
            showToast(err.message || 'Move failed', 'error');
        }
    };

    const handleDragStart = (e: React.DragEvent, node: DriveNode) => {
        if (projectRole === 'read_only') {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('application/json', JSON.stringify({ nodeId: node.id }));
    };

    // ── Upload a single File object into the current context ──
    const uploadSingleFile = async (
        file: File,
        parentId: string | null,
        projectId: string | undefined
    ) => {
        const mimeType = file.type || 'application/octet-stream';
        const taskId = `up-${Date.now()}-${Math.random()}`;
        addTransfer(taskId, `Uploading ${file.name}`, 'upload');
        const { uploadUrl, key } = await getUploadPresignedUrl(file.name, mimeType, projectId, parentId);
        if (uploadUrl !== 'mock-url') {
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable) updateTransfer(taskId, Math.round((ev.loaded / ev.total) * 100));
                };
                xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed ${xhr.status}`))),
                    xhr.onerror = () => reject(new Error('Network error'));
                xhr.open('PUT', uploadUrl);
                xhr.setRequestHeader('Content-Type', mimeType);
                xhr.send(file);
            });
        }
        await saveFileRecord(file.name, key, file.size, mimeType, parentId, projectId);
        completeTransfer(taskId, 'completed');
    };

    // ── Recursively process a FileSystemEntry (file or directory) ──
    const processEntry = async (
        entry: FileSystemEntry,
        parentId: string | null,
        projectId: string | undefined
    ): Promise<void> => {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) =>
                (entry as FileSystemFileEntry).file(resolve, reject)
            );
            await uploadSingleFile(file, parentId, projectId);
        } else if (entry.isDirectory) {
            // Create folder via server action (respects RLS + activity logging)
            await createFolderFolder(entry.name, parentId, projectId);
            // Fetch the id of the just-created folder
            const { supabase } = await import('@/lib/supabase');
            const q = supabase
                .from('share_nodes')
                .select('id')
                .eq('name', entry.name)
                .eq('type', 'folder')
                .order('created_at', { ascending: false })
                .limit(1);
            const finalQ = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
            const { data: folderRow } = await finalQ.single();
            const newFolderId = folderRow?.id ?? null;

            // Read directory children
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            const readAll = (): Promise<FileSystemEntry[]> =>
                new Promise((resolve, reject) => {
                    const allEntries: FileSystemEntry[] = [];
                    const readBatch = () => {
                        reader.readEntries((batch) => {
                            if (batch.length === 0) resolve(allEntries);
                            else { allEntries.push(...batch); readBatch(); }
                        }, reject);
                    };
                    readBatch();
                });

            const children = await readAll();
            for (const child of children) {
                await processEntry(child, newFolderId, projectId);
            }
        }
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        // Only show overlay for external OS files (not internal node drag)
        if (e.dataTransfer.types.includes('Files')) {
            dragCounter.current++;
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
            dragCounter.current--;
            if (dragCounter.current <= 0) {
                dragCounter.current = 0;
                setIsDragOver(false);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (projectRole !== 'read_only') e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
        e.preventDefault();
        setIsDragOver(false);
        dragCounter.current = 0;
        if (projectRole === 'read_only') return;

        const projectId = searchParams?.get('projectId') || undefined;

        // ── Case 1: OS file/folder drop ──
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            const items = Array.from(e.dataTransfer.items);
            const entries = items
                .map(item => item.webkitGetAsEntry?.())
                .filter((entry): entry is FileSystemEntry => entry !== null && entry !== undefined);

            if (entries.length > 0) {
                setIsUploading(true);
                try {
                    for (const entry of entries) {
                        await processEntry(entry, targetFolderId, projectId);
                    }
                    showToast(`Uploaded ${entries.length} item(s)`, 'success');
                    loadData();
                } catch (err) {
                    console.error(err);
                    showToast('Upload failed', 'error');
                } finally {
                    setIsUploading(false);
                }
                return; // don't fall through to move logic
            }
        }

        // ── Case 2: Internal node drag (move) ──
        try {
            const data = e.dataTransfer.getData('application/json');
            if (!data) return;
            const { nodeId } = JSON.parse(data);
            if (nodeId === targetFolderId) return;
            setLoading(true);
            await moveNode(nodeId, targetFolderId);
            showToast('Moved successfully', 'success');
            loadData();
        } catch (err: any) {
            showToast(err.message || 'Move failed', 'error');
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const taskId = `up-${Date.now()}`;
        addTransfer(taskId, `Uploading ${file.name}`, 'upload');

        try {
            // 1. Get presigned URL
            const projectId = searchParams?.get('projectId') || undefined;
            const mimeType = file.type || 'application/octet-stream';
            const { uploadUrl, key } = await getUploadPresignedUrl(file.name, mimeType, projectId, currentFolder.id);

            // If uploadUrl is 'mock-url' we skip actual PUT request so UI doesn't crash without keys
            if (uploadUrl !== 'mock-url') {
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.upload.onprogress = (ev) => {
                        if (ev.lengthComputable) {
                            updateTransfer(taskId, Math.round((ev.loaded / ev.total) * 100));
                        }
                    };
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) resolve();
                        else reject(new Error(`Upload failed with status ${xhr.status}`));
                    };
                    xhr.onerror = () => reject(new Error('Network error during upload'));
                    xhr.open('PUT', uploadUrl);
                    // Standard S3 PUT: send the binary file with EXACT Content-Type that was signed
                    xhr.setRequestHeader('Content-Type', mimeType);
                    xhr.send(file);
                });
            }

            // 3. Save to database
            await saveFileRecord(file.name, key, file.size, mimeType, currentFolder.id, projectId);
            completeTransfer(taskId, 'completed');
            loadData();
        } catch (err) {
            console.error(err);
            completeTransfer(taskId, 'error');
            showToast('Upload failed', 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const fileArray = Array.from(files);
        const folderName = fileArray[0].webkitRelativePath.split('/')[0] || 'New Folder';
        const totalSize = fileArray.reduce((acc, f) => acc + f.size, 0);

        setPendingFolderUpload({
            files: fileArray,
            folderName,
            totalSize
        });
    };

    const processFolderUpload = async () => {
        if (!pendingFolderUpload) return;
        const { files, folderName } = pendingFolderUpload;
        setPendingFolderUpload(null);

        setIsUploading(true);
        try {
            const folderCache = new Map<string, string | null>();
            folderCache.set('', currentFolder.id);

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const parts = file.webkitRelativePath.split('/');
                const fileName = parts.pop() || file.name;
                const folderPath = parts.join('/');
                const projectId = searchParams?.get('projectId') || undefined;

                if (!folderCache.has(folderPath)) {
                    const leafId = await ensurePathExists(parts, currentFolder.id, projectId);
                    folderCache.set(folderPath, leafId);
                }

                const targetParentId = folderCache.get(folderPath);

                const mimeType = file.type || 'application/octet-stream';
                const { uploadUrl, key } = await getUploadPresignedUrl(fileName, mimeType, projectId, targetParentId || null);
                const taskId = `up-${Date.now()}-${i}`;
                addTransfer(taskId, `Uploading ${fileName}`, 'upload');

                if (uploadUrl !== 'mock-url') {
                    try {
                        await new Promise<void>((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.upload.onprogress = (ev) => {
                                if (ev.lengthComputable) {
                                    updateTransfer(taskId, Math.round((ev.loaded / ev.total) * 100));
                                }
                            };
                            xhr.onload = () => {
                                if (xhr.status >= 200 && xhr.status < 300) resolve();
                                else reject(new Error(`Upload failed with status ${xhr.status}`));
                            };
                            xhr.onerror = () => reject(new Error('Network error during upload'));
                            xhr.open('PUT', uploadUrl);
                            // Standard S3 PUT: send the binary file with EXACT Content-Type that was signed
                            xhr.setRequestHeader('Content-Type', mimeType);
                            xhr.send(file);
                        });
                        completeTransfer(taskId, 'completed');
                    } catch (e) {
                        completeTransfer(taskId, 'error');
                        throw new Error("Folder Chunk failed");
                    }
                }

                await saveFileRecord(fileName, key, file.size, mimeType, targetParentId || null, projectId);
            }
            showToast('Folder upload completed', 'success');
            loadData();
        } catch (err) {
            console.error(err);
            showToast('Folder upload failed', 'error');
        } finally {
            setIsUploading(false);
            if (folderInputRef.current) folderInputRef.current.value = '';
        }
    };

    const handleDelete = async (e: React.MouseEvent, node: DriveNode) => {
        e.stopPropagation();
        showConfirm(`Are you sure you want to delete ${node.name}?`, async () => {
            try {
                await deleteNode(node.id, node.r2_key);
                loadData();
                showToast(`Deleted ${node.name}`, 'success');
                setSelectedIds(prev => { const n = new Set(prev); n.delete(node.id); return n; });
            } catch (err) {
                console.error(err);
                showToast('Delete failed', 'error');
            }
        });
    };

    const handleMultiDelete = async () => {
        if (selectedIds.size === 0) return;
        showConfirm(`Are you sure you want to delete ${selectedIds.size} items?`, async () => {
            setLoading(true);
            try {
                const nodesToDelete = nodes.filter(n => selectedIds.has(n.id));
                for (const node of nodesToDelete) {
                    await deleteNode(node.id, node.r2_key);
                }
                showToast(`Deleted ${selectedIds.size} items`, 'success');
                setSelectedIds(new Set());
                loadData();
            } catch (err) {
                console.error(err);
                showToast('Failed to delete some items', 'error');
                loadData();
            }
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === nodes.length && nodes.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(nodes.map(n => n.id)));
        }
    };

    const toggleSelect = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleNodeClick = (node: DriveNode) => {
        if (node.type === 'folder') {
            navigateToFolder(node);
        } else {
            setPreviewNode(node);
        }
    };

    const navigateToFolder = (node: DriveNode) => {
        if (node.type !== 'folder') return;
        const projectId = searchParams?.get('projectId') || null;
        setFolderHistory(prev => [...prev, currentFolder]);
        setCurrentFolder({ id: node.id, name: node.name });

        loadData(node.id, undefined, false);
        lastUrlState.current = { projectId, folderId: node.id, search: null, recent: false };

        const newUrl = `/?folderId=${node.id}${projectId ? `&projectId=${projectId}` : ''}`;
        window.history.pushState(null, '', newUrl);
    };

    const goBack = () => {
        const prev = folderHistory.pop();
        if (!prev) return;
        setFolderHistory([...folderHistory]);
        setCurrentFolder(prev);

        const projectId = searchParams?.get('projectId') || null;
        loadData(prev.id || null, undefined, false);
        lastUrlState.current = { projectId, folderId: prev.id, search: null, recent: false };

        const newUrl = prev.id ? `/?folderId=${prev.id}${projectId ? `&projectId=${projectId}` : ''}` : `/${projectId ? `?projectId=${projectId}` : ''}`;
        window.history.pushState(null, '', newUrl);
    };

    const handleDownload = async (e: React.MouseEvent, node: DriveNode) => {
        e.stopPropagation();
        if (node.type !== 'file' || !node.r2_key) return;

        try {
            const url = await getDownloadUrl(node.r2_key, node.name);
            if (url === 'https://example.com/mock-download') {
                showToast('R2 is not configured. Returning mock download.', 'info');
                return;
            }

            const taskId = `dl-${Date.now()}`;
            addTransfer(taskId, `Downloading ${node.name}`, 'download');

            const xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';
            xhr.onprogress = (ev) => {
                if (ev.lengthComputable) {
                    updateTransfer(taskId, Math.round((ev.loaded / ev.total) * 100));
                } else {
                    // simulate fake progress for indeterminate
                    setTransfers(prev => prev.map(t => t.id === taskId && t.progress < 90 ? { ...t, progress: t.progress + 5 } : t));
                }
            };
            xhr.onload = () => {
                if (xhr.status < 300) {
                    const blobUrl = URL.createObjectURL(xhr.response);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = node.name;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(blobUrl);
                    completeTransfer(taskId, 'completed');
                    // Fire-and-forget log
                    const projectId = searchParams?.get('projectId') || null;
                    logDownload(node.id, node.name, projectId);
                } else {
                    completeTransfer(taskId, 'error');
                }
            };
            xhr.onerror = () => completeTransfer(taskId, 'error');
            xhr.open('GET', url);
            xhr.send();
        } catch (err) {
            console.error("Download fail", err);
            showToast('Download Failed', 'error');
        }
    };

    const handleDownloadFolder = async (e: React.MouseEvent, node: DriveNode) => {
        e.stopPropagation();
        if (node.type !== 'folder') return;

        const taskId = `zip-${Date.now()}`;
        addTransfer(taskId, `Zipping ${node.name} (Browser Download)`, 'download');

        try {
            const form = document.createElement('form');
            form.method = 'GET';
            form.action = `/api/folder/${node.id}/download-zip`;
            form.style.display = 'none';
            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            setTimeout(() => {
                completeTransfer(taskId, 'completed');
            }, 3000);
        } catch (err) {
            console.error(err);
            completeTransfer(taskId, 'error');
            showToast('Download failed', 'error');
        }
    };

    const openShareModal = async (e: React.MouseEvent, node: DriveNode) => {
        e.stopPropagation();
        setShareNode(node);
        setSharePassword('');
        setExpiresInDays('0');
        setGeneratedLink('');
        setActiveLinks([]);
        const res = await getNodeShareLinks(node.id);
        if (res.success) {
            setActiveLinks(res.links);
        }
    };

    const handleCreateShareLink = async () => {
        if (!shareNode) return;
        setIsSharing(true);
        try {
            let expiresAt = undefined;
            if (expiresInDays !== '0') {
                const date = new Date();
                date.setDate(date.getDate() + parseInt(expiresInDays, 10));
                expiresAt = date.toISOString();
            }
            const res = await createShareLink(shareNode.id, sharePassword || undefined, expiresAt);
            if (res.success) {
                const link = `${window.location.origin}/s/${res.linkId}`;
                setGeneratedLink(link);
                // reload active links
                const rel = await getNodeShareLinks(shareNode.id);
                if (rel.success) setActiveLinks(rel.links);
            } else {
                showToast((res as { error?: string }).error || 'Failed to create link', 'error');
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Error occurred';
            showToast(errorMessage, 'error');
        } finally {
            setIsSharing(false);
        }
    };

    const handleRevokeShareLink = async (linkId: string) => {
        showConfirm('Are you sure you want to revoke this link? Anyone using it will immediately lose access.', async () => {
            try {
                await revokeShareLink(linkId);
                setActiveLinks(prev => prev.filter(l => l.id !== linkId));
                showToast('Link revoked', 'success');
            } catch (err) {
                console.error(err);
                showToast('Failed to revoke link', 'error');
            }
        });
    };

    const getFileIcon = (mimeType: string | null) => {
        if (!mimeType) return <File size={18} className={styles.fileIcon} />;
        if (mimeType.includes('image')) return <ImageIcon size={18} color="#34d399" />;
        if (mimeType.includes('video')) return <Video size={18} color="#f87171" />;
        if (mimeType.includes('pdf')) return <FileText size={18} color="#f87171" />;
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return <Archive size={18} color="#fbbf24" />;
        return <File size={18} className={styles.fileIcon} />;
    };

    const formatSize = (bytes: number | null) => {
        if (bytes === null) return '--';
        const mb = bytes / (1024 * 1024);
        if (mb < 1) return (bytes / 1024).toFixed(1) + ' KB';
        return mb.toFixed(1) + ' MB';
    };

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <div className={styles.breadcrumb}>
                    {searchParams?.get('recent') === 'true' ? (
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Recent Uploads</span>
                    ) : (
                        <>
                            {currentFolder.id && (
                                <button onClick={goBack} className={styles.breadcrumbCrumb} style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                                    <ArrowLeft size={18} />
                                </button>
                            )}
                            {/* Root / Project name */}
                            <span className={styles.breadcrumbCrumb} onClick={() => {
                                const projectId = searchParams?.get('projectId') || null;
                                setCurrentFolder({ id: null, name: 'Root' });
                                setFolderHistory([]);

                                loadData(null, undefined, false);
                                lastUrlState.current = { projectId, folderId: null, search: null, recent: false };

                                const newUrl = projectId ? `/?projectId=${projectId}` : '/';
                                window.history.pushState(null, '', newUrl);
                            }}>
                                {projectName}
                            </span>
                            {/* All parents from folderHistory (skip index 0 which is the "Root" placeholder) */}
                            {folderHistory.filter(f => f.id !== null).map((ancestor, idx) => {
                                const projectId = searchParams?.get('projectId');
                                // The ancestors that come AFTER this one in the history
                                const newHistory = folderHistory.slice(0, folderHistory.indexOf(ancestor));
                                return (
                                    <React.Fragment key={ancestor.id ?? `root-${idx}`}>
                                        <ChevronRight size={14} style={{ color: 'var(--text-light)', margin: '0 2px', flexShrink: 0 }} />
                                        <span
                                            className={styles.breadcrumbCrumb}
                                            onClick={() => {
                                                setFolderHistory(newHistory);
                                                setCurrentFolder(ancestor);
                                                const pId = projectId || null;

                                                loadData(ancestor.id || null, undefined, false);
                                                lastUrlState.current = { projectId: pId, folderId: ancestor.id, search: null, recent: false };

                                                const newUrl = ancestor.id ? `/?folderId=${ancestor.id}${pId ? `&projectId=${pId}` : ''}` : `/${pId ? `?projectId=${pId}` : ''}`;
                                                window.history.pushState(null, '', newUrl);
                                            }}
                                        >
                                            {ancestor.name}
                                        </span>
                                    </React.Fragment>
                                );
                            })}
                            {/* Current folder */}
                            {currentFolder.id && (
                                <>
                                    <ChevronRight size={14} style={{ color: 'var(--text-muted)', margin: '0 2px', flexShrink: 0 }} />
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentFolder.name}</span>
                                </>
                            )}
                        </>
                    )}
                </div>

                {isGlobalRoot && projectRole === 'admin' && (
                    <div style={{ padding: '10px 16px', background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 'var(--r-md)', color: 'var(--info-text)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>ℹ️</span>
                        <div><strong>Global View:</strong> Viewing files outside any project. Select a project from the sidebar.</div>
                    </div>
                )}

                {(searchParams?.get('recent') !== 'true' && projectRole !== 'read_only') && (
                    <div className={styles.actions}>
                        <button className={styles.secondaryBtn} onClick={() => setShowFolderModal(true)}>
                            <FolderPlus size={18} />
                            New Folder
                        </button>

                        <button
                            className={styles.secondaryBtn}
                            onClick={() => folderInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            <FolderPlus size={18} />
                            Upload Folder
                        </button>
                        <input
                            type="file"
                            webkitdirectory="true"
                            directory="true"
                            multiple
                            ref={folderInputRef}
                            className={styles.fileInput}
                            onChange={handleFolderUpload}
                        />

                        <button
                            className={styles.primaryBtn}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            <UploadCloud size={18} />
                            {isUploading ? 'Uploading...' : 'Upload File'}
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className={styles.fileInput}
                            onChange={handleFileUpload}
                        />
                    </div>
                )}

            </div>

            {/* ── Drop overlay ── */}
            <div
                className={styles.content}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, currentFolder.id)}
                style={{ position: 'relative' }}
            >
                {/* Full-area drop target overlay */}
                {isDragOver && projectRole !== 'read_only' && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        zIndex: 50,
                        background: 'rgba(99,102,241,0.08)',
                        border: '2px dashed var(--brand-end)',
                        borderRadius: 'var(--r-lg)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 12,
                        pointerEvents: 'none',
                        transition: 'all 0.15s',
                        backdropFilter: 'blur(2px)',
                    }}>
                        <div style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'rgba(99,102,241,0.15)',
                            border: '2px solid var(--brand-end)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: 'pulse 1.5s ease-in-out infinite',
                        }}>
                            <UploadCloud size={32} color="var(--brand-end)" />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-end)' }}>Drop to upload</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>Files and folders supported</div>
                        </div>
                    </div>
                )}
                {loading ? (
                    <div className={styles.loadingState}>
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className={styles.skeletonRow} style={{ opacity: 1 - i * 0.09 }} />
                        ))}
                    </div>
                ) : (
                    <>
                        <div className={styles.listHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div onClick={toggleSelectAll} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: selectedIds.size > 0 && selectedIds.size === nodes.length ? 'var(--brand-end)' : 'var(--text-muted)' }}>
                                    {selectedIds.size > 0 && selectedIds.size === nodes.length ? <CheckSquare size={16} /> : <Square size={16} />}
                                </div>
                                Name
                            </div>
                            <div>Modified</div>
                            <div>Size</div>
                            <div />
                        </div>

                        {nodes.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Folder size={44} color="var(--text-muted)" />
                                <p>This folder is empty.</p>
                            </div>
                        ) : (
                            nodes.map(node => (
                                <div
                                    key={node.id}
                                    className={styles.listItem}
                                    draggable={projectRole !== 'read_only'}
                                    onDragStart={(e) => handleDragStart(e, node)}
                                    onDragOver={node.type === 'folder' ? handleDragOver : undefined}
                                    onDrop={node.type === 'folder' ? (e) => {
                                        e.stopPropagation();
                                        handleDrop(e, node.id);
                                    } : undefined}
                                    onClick={() => handleNodeClick(node)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setContextMenu({ x: e.clientX, y: e.clientY, node });
                                    }}
                                    style={{ background: selectedIds.has(node.id) ? 'rgba(99,102,241,0.08)' : undefined }}
                                >
                                    <div className={styles.nameCol}>
                                        <div onClick={(e) => toggleSelect(e, node.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: selectedIds.has(node.id) ? 'var(--brand-end)' : 'var(--border-mid)', marginRight: 12 }}>
                                            {selectedIds.has(node.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </div>
                                        <div className={styles.iconWrapper}>
                                            {node.type === 'folder' ? (
                                                <Folder size={18} color="var(--brand-end)" fill="var(--brand-end)" fillOpacity={0.18} className={styles.folderIcon} />
                                            ) : (
                                                getFileIcon(node.mime_type)
                                            )}
                                        </div>
                                        <span className={styles.nameText}>{node.name}</span>
                                    </div>
                                    <div className={styles.metaCol}>
                                        {new Date(node.updated_at).toLocaleDateString()}
                                    </div>
                                    <div className={styles.metaCol}>
                                        {formatSize(node.size)}
                                    </div>
                                    <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                                        {node.type === 'file' ? (
                                            <button className={styles.itemBtn} title="Download" onClick={(e) => { handleDownload(e, node); }}>
                                                <DownloadCloud size={15} />
                                            </button>
                                        ) : (
                                            <button className={styles.itemBtn} title="Download Folder" onClick={(e) => { handleDownloadFolder(e, node); }}>
                                                <DownloadCloud size={15} />
                                            </button>
                                        )}
                                        <button className={styles.itemBtn} title="Share" onClick={(e) => { openShareModal(e, node); }}>
                                            <Share2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>

            {/* ── Multi-select Action Bar ── */}
            {selectedIds.size > 0 && (
                <div style={{
                    position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-mid)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
                    borderRadius: 'var(--r-full)', padding: '8px 16px', zIndex: 900,
                    display: 'flex', alignItems: 'center', gap: 20,
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    backdropFilter: 'blur(12px)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                        <div style={{ background: 'var(--brand-end)', color: 'white', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                            {selectedIds.size}
                        </div>
                        selected
                    </div>
                    <div style={{ width: 1, height: 24, background: 'var(--border-soft)' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                        {projectRole !== 'read_only' && (
                            <button
                                onClick={handleMultiDelete}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: 'rgba(239,68,68,0.1)', color: 'var(--error-text)', border: 'none',
                                    padding: '6px 12px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                                    fontWeight: 600, fontSize: '0.85rem'
                                }}
                            >
                                <Trash2 size={16} /> Delete
                            </button>
                        )}
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            style={{
                                background: 'transparent', color: 'var(--text-muted)', border: 'none',
                                padding: '6px 12px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                                fontWeight: 500, fontSize: '0.85rem'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {showFolderModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h3 className={styles.modalTitle}>Create New Folder</h3>
                        <input
                            type="text"
                            className={styles.textInput}
                            autoFocus
                            placeholder="Folder name"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateFolder();
                            }}
                        />
                        <div className={styles.modalActions}>
                            <button className={styles.secondaryBtn} onClick={() => setShowFolderModal(false)}>Cancel</button>
                            <button className={styles.primaryBtn} onClick={handleCreateFolder}>Create</button>
                        </div>
                    </div>
                </div>
            )}

            {renameNodeData && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h3 className={styles.modalTitle}>Rename</h3>
                        <input
                            type="text"
                            className={styles.textInput}
                            autoFocus
                            placeholder="New name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameNode();
                            }}
                        />
                        <div className={styles.modalActions}>
                            <button className={styles.secondaryBtn} onClick={() => setRenameNodeData(null)}>Cancel</button>
                            <button className={styles.primaryBtn} onClick={handleRenameNode}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {moveNodeData && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent} style={{ minWidth: '400px' }}>
                        <h3 className={styles.modalTitle}>Move {moveNodeData.name} To...</h3>

                        <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {moveModalCurrentFolder.id && (
                                <button onClick={() => {
                                    const history = [...moveModalFolderHistory];
                                    const prev = history.pop();
                                    if (prev) {
                                        setMoveModalFolderHistory(history);
                                        setMoveModalCurrentFolder(prev);
                                        loadMoveModalData(prev.id);
                                    } else {
                                        setMoveModalFolderHistory([]);
                                        setMoveModalCurrentFolder({ id: null, name: 'Root' });
                                        loadMoveModalData(null);
                                    }
                                }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-light)' }}>
                                    <ArrowLeft size={14} style={{ marginRight: '4px' }} /> Back
                                </button>
                            )}
                            <span style={{ fontWeight: 600, color: 'var(--text-dark)', marginLeft: '8px' }}>
                                Current: {moveModalCurrentFolder.name}
                            </span>
                        </div>

                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', height: '200px', overflowY: 'auto' }}>
                            {isMovingLoading ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)' }}>Loading...</div>
                            ) : moveModalNodes.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)' }}>No folders found</div>
                            ) : (
                                moveModalNodes.map(folder => (
                                    <div key={folder.id}
                                        style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid var(--bg-color)' }}
                                        className={styles.rowHover}
                                        onClick={() => {
                                            setMoveModalFolderHistory([...moveModalFolderHistory, moveModalCurrentFolder]);
                                            setMoveModalCurrentFolder({ id: folder.id, name: folder.name });
                                            loadMoveModalData(folder.id);
                                        }}
                                    >
                                        <Folder size={16} fill="var(--primary-color)" fillOpacity={0.2} color="var(--primary-color)" style={{ marginRight: '8px' }} />
                                        <span style={{ flex: 1 }}>{folder.name}</span>
                                        <ChevronRight size={16} color="var(--text-light)" />
                                    </div>
                                ))
                            )}
                        </div>

                        <div className={styles.modalActions} style={{ marginTop: '20px' }}>
                            <button className={styles.secondaryBtn} onClick={() => setMoveNodeData(null)}>Cancel</button>
                            <button className={styles.primaryBtn} onClick={() => submitMove(moveModalCurrentFolder.id)}>Move Here</button>
                        </div>
                    </div>
                </div>
            )}

            {shareNode && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h3 className={styles.modalTitle}>Share &quot;{shareNode.name}&quot;</h3>

                        {!generatedLink ? (
                            <>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '16px' }}>
                                    Anyone with the link can securely access this {shareNode.type === 'folder' ? 'folder' : 'file'}. You can optionally protect it with a password.
                                </p>
                                <input
                                    type="text"
                                    className={styles.textInput}
                                    placeholder="Enter access password (Optional)"
                                    value={sharePassword}
                                    onChange={(e) => setSharePassword(e.target.value)}
                                />
                                <select
                                    className={styles.textInput}
                                    value={expiresInDays}
                                    onChange={(e) => setExpiresInDays(e.target.value)}
                                    style={{ marginTop: '12px' }}
                                >
                                    <option value="0">Never Expires</option>
                                    <option value="1">Expires in 1 Day</option>
                                    <option value="7">Expires in 7 Days</option>
                                    <option value="30">Expires in 30 Days</option>
                                </select>

                                <div className={styles.modalActions} style={{ marginTop: '24px' }}>
                                    <button className={styles.secondaryBtn} onClick={() => setShareNode(null)}>Cancel</button>
                                    <button className={styles.primaryBtn} onClick={handleCreateShareLink} disabled={isSharing}>
                                        <Share2 size={16} />
                                        {isSharing ? 'Creating...' : 'Create Link'}
                                    </button>
                                </div>

                                {activeLinks.length > 0 && (
                                    <div style={{ marginTop: '32px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                                        <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-dark)' }}>Active Links</h4>
                                        <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {activeLinks.map(link => (
                                                <div key={link.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-soft)' }}>
                                                    <div style={{ fontSize: '0.8rem' }}>
                                                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '2px' }}>Created: {new Date(link.created_at).toLocaleDateString()}</div>
                                                        {link.expires_at ? (
                                                            <div style={{ color: new Date(link.expires_at) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>
                                                                Expires: {new Date(link.expires_at).toLocaleDateString()}
                                                            </div>
                                                        ) : (
                                                            <div style={{ color: 'var(--text-muted)' }}>Never Expires</div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            className={styles.secondaryBtn}
                                                            style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--border-mid)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(`${window.location.origin}/s/${link.id}`);
                                                                showToast('Link copied to clipboard!', 'success');
                                                            }}
                                                        >
                                                            <Copy size={12} /> Copy
                                                        </button>
                                                        <button
                                                            className={styles.secondaryBtn}
                                                            style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444', background: 'rgba(239,68,68,0.05)' }}
                                                            onClick={() => handleRevokeShareLink(link.id)}
                                                        >
                                                            Revoke
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{ background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)', padding: '12px 16px', borderRadius: 'var(--r-md)', marginBottom: '16px', fontSize: '0.875rem', fontWeight: 600 }}>
                                    ✓ Link generated successfully!
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                                    <input
                                        type="text"
                                        value={generatedLink}
                                        readOnly
                                        className={styles.textInput}
                                        style={{ marginBottom: 0, background: 'var(--secondary-color)' }}
                                    />
                                    <button
                                        className={styles.primaryBtn}
                                        onClick={() => {
                                            navigator.clipboard.writeText(generatedLink);
                                            showToast('Copied to clipboard!', 'success');
                                        }}
                                        title="Copy Link"
                                    >
                                        <Copy size={16} />
                                    </button>
                                </div>
                                <div className={styles.modalActions}>
                                    <button className={styles.secondaryBtn} onClick={() => setShareNode(null)}>Close</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Transfer Queue Panel ── */}
            {transfers.length > 0 && showTransfers && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px', width: '340px',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-mid)',
                    borderRadius: 'var(--r-lg)', zIndex: 1000,
                    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    animation: 'scaleIn 0.2s ease-out'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, var(--brand-start), var(--brand-mid))',
                        color: '#fff', padding: '11px 16px', fontWeight: 600, fontSize: '0.85rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <span>Transfers ({transfers.filter(t => t.status === 'completed').length}/{transfers.length})</span>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowTransfers(false)} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', fontWeight: 700 }}>−</button>
                            <button onClick={() => setTransfers([])} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', fontWeight: 700 }}>✕</button>
                        </div>
                    </div>
                    <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                        {transfers.map(task => (
                            <div key={task.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-soft)' }}>
                                <div style={{ fontSize: '0.825rem', marginBottom: '7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {task.name}
                                </div>
                                {task.status === 'running' && (
                                    <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--brand-start), var(--brand-end))', width: `${Math.max(5, task.progress)}%`, transition: 'width 0.3s ease' }} />
                                    </div>
                                )}
                                {task.status === 'completed' && <div style={{ fontSize: '0.78rem', color: 'var(--success-text)', fontWeight: 600 }}>✓ Completed</div>}
                                {task.status === 'error' && <div style={{ fontSize: '0.78rem', color: 'var(--error-text)', fontWeight: 600 }}>✕ Failed</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {!showTransfers && transfers.length > 0 && (
                <button
                    onClick={() => setShowTransfers(true)}
                    style={{
                        position: 'fixed', bottom: '24px', right: '24px',
                        padding: '10px 20px', background: 'var(--bg-surface)',
                        color: 'var(--brand-end)', borderRadius: 'var(--r-full)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1px solid var(--border-mid)',
                        fontWeight: 600, fontSize: '0.85rem', zIndex: 1000
                    }}
                >
                    ↑ Transfers ({transfers.filter(t => t.status === 'running').length} running)
                </button>
            )}

            {/* ── Context Menu ── */}
            {contextMenu && typeof document !== 'undefined' && createPortal(
                <div
                    className={styles.contextMenu}
                    style={{
                        position: 'fixed',
                        top: Math.min(contextMenu.y, window.innerHeight - 220),
                        left: Math.min(contextMenu.x, window.innerWidth - 200),
                        zIndex: 99999,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ padding: '6px 12px 8px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)', marginBottom: '4px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {contextMenu.node.name}
                    </div>
                    {(searchParams?.get('search') || searchParams?.get('recent') === 'true') && (
                        <button className={styles.contextMenuBtn} onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu(null);
                            if (contextMenu.node.parent_id) { router.push(`/?folderId=${contextMenu.node.parent_id}`); }
                            else { router.push('/'); }
                        }}>
                            <ExternalLink size={14} /> Go to Location
                        </button>
                    )}
                    <button className={styles.contextMenuBtn} onClick={(e) => {
                        if (contextMenu.node.type === 'file') handleDownload(e, contextMenu.node);
                        else handleDownloadFolder(e, contextMenu.node);
                        setContextMenu(null);
                    }}>
                        <DownloadCloud size={14} /> Download
                    </button>
                    {contextMenu.node.type === 'folder' && (
                        <button className={styles.contextMenuBtn} onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(`${window.location.origin}/?folderId=${contextMenu.node.id}`);
                            showToast('Link copied!', 'success');
                            setContextMenu(null);
                        }}>
                            <LinkIcon size={14} /> Copy Link
                        </button>
                    )}
                    <button className={styles.contextMenuBtn} onClick={(e) => { openShareModal(e, contextMenu.node); setContextMenu(null); }}>
                        <Share2 size={14} /> Share
                    </button>
                    {projectRole !== 'read_only' && (
                        <>
                            <div className={styles.contextMenuDivider} />
                            <button className={styles.contextMenuBtn} onClick={(e) => {
                                e.stopPropagation();
                                setRenameNodeData(contextMenu.node);
                                setEditName(contextMenu.node.name);
                                setContextMenu(null);
                            }}>
                                <Edit2 size={14} /> Rename
                            </button>
                            <button className={styles.contextMenuBtn} onClick={(e) => {
                                e.stopPropagation();
                                setMoveNodeData(contextMenu.node);
                                setContextMenu(null);
                            }}>
                                <MoveRight size={14} /> Move To
                            </button>
                            <button className={`${styles.contextMenuBtn} ${styles.contextMenuBtnDanger}`} onClick={(e) => { handleDelete(e, contextMenu.node); setContextMenu(null); }}>
                                <Trash2 size={14} /> Delete
                            </button>
                        </>
                    )}
                </div>, document.body
            )}
            {/* ── Folder Upload Confirmation ── */}
            {pendingFolderUpload && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent} style={{ textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 'var(--r-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <UploadCloud size={32} color="var(--brand-end)" />
                        </div>
                        <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Confirm Folder Upload</h2>
                        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.875rem' }}>
                            Upload <strong style={{ color: 'var(--text-primary)' }}>&quot;{pendingFolderUpload.folderName}&quot;</strong> with{' '}
                            <strong style={{ color: 'var(--brand-end)' }}>{pendingFolderUpload.files.length}</strong> files.
                        </p>
                        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', padding: '14px 18px', borderRadius: 'var(--r-md)', marginBottom: '22px', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '3px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Size</div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatSize(pendingFolderUpload.totalSize)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '3px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Destination</div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{currentFolder.name}</div>
                            </div>
                        </div>
                        <div className={styles.modalActions}>
                            <button className={styles.secondaryBtn} onClick={() => { setPendingFolderUpload(null); if (folderInputRef.current) folderInputRef.current.value = ''; }}>Cancel</button>
                            <button className={styles.primaryBtn} onClick={processFolderUpload}><UploadCloud size={15} /> Start Upload</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── File Preview Modal ── */}
            {previewNode && (
                <FilePreviewModal
                    node={previewNode}
                    onClose={() => setPreviewNode(null)}
                    onDownload={() => {
                        setPreviewNode(null);
                        handleDownload({ stopPropagation: () => { } } as any, previewNode);
                    }}
                />
            )}
        </div>
    );
}
