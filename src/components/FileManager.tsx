'use client';

import React, { useState, useEffect, useRef } from 'react';
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
    fetchProject
} from '@/app/actions';
import {
    FolderPlus, UploadCloud, Folder, File,
    Trash2, ArrowLeft, DownloadCloud, FileText, Image as ImageIcon, Video, Archive, Share2, Copy, Link as LinkIcon, ExternalLink, Edit2, MoveRight, ChevronRight
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

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: DriveNode } | null>(null);

    const [loading, setLoading] = useState(true);
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renameNodeData, setRenameNodeData] = useState<DriveNode | null>(null);
    const [editName, setEditName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [projectRole, setProjectRole] = useState<'admin' | 'member' | 'read_only'>('read_only');
    const [projectName, setProjectName] = useState('Workspace');

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
            const folderId = searchParams?.get('folderId');
            const searchQ = searchParams?.get('search') || undefined;
            const isRecent = searchParams?.get('recent') === 'true';

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

            const pId = searchParams?.get('projectId');
            if (pId) {
                const proj = await fetchProject(pId);
                if (proj) setProjectName(proj.name);
            } else {
                setProjectName('Workspace');
            }

            // Check project role permissions
            const role = await getMyRoleInProject(pId);
            setProjectRole(role as 'admin' | 'member' | 'read_only');

            loadData(isRecent ? null : folderId || null, searchQ, isRecent);
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

    const handleDragOver = (e: React.DragEvent) => {
        if (projectRole !== 'read_only') {
            e.preventDefault();
        }
    };

    const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
        e.preventDefault();
        if (projectRole === 'read_only') return;
        try {
            const data = e.dataTransfer.getData('application/json');
            if (!data) return;
            const { nodeId } = JSON.parse(data);
            if (nodeId === targetFolderId) return;

            setLoading(true);
            await moveNode(nodeId, targetFolderId);
            showToast('Moved successfully via Drop', 'success');
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
            } catch (err) {
                console.error(err);
                showToast('Delete failed', 'error');
            }
        });
    };

    const navigateToFolder = (node: DriveNode) => {
        if (node.type !== 'folder') return;
        const projectId = searchParams?.get('projectId');
        setFolderHistory(prev => [...prev, currentFolder]);
        setCurrentFolder({ id: node.id, name: node.name });
        router.push(`/?folderId=${node.id}${projectId ? `&projectId=${projectId}` : ''}`);
    };

    const goBack = () => {
        const prev = folderHistory.pop();
        if (!prev) return;
        setFolderHistory([...folderHistory]);
        setCurrentFolder(prev);
        const projectId = searchParams?.get('projectId');
        if (prev.id) router.push(`/?folderId=${prev.id}${projectId ? `&projectId=${projectId}` : ''}`);
        else router.push(`/${projectId ? `?projectId=${projectId}` : ''}`);
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
        if (!mimeType) return <File size={20} className={styles.fileIcon} />;
        if (mimeType.includes('image')) return <ImageIcon size={20} color="#10b981" />;
        if (mimeType.includes('video')) return <Video size={20} color="#f43f5e" />;
        if (mimeType.includes('pdf')) return <FileText size={20} color="#ef4444" />;
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return <Archive size={20} color="#f59e0b" />;
        return <File size={20} className={styles.fileIcon} />;
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
                        <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>Recent Uploads</span>
                    ) : (
                        <>
                            {currentFolder.id && (
                                <button onClick={goBack} className={styles.breadcrumbCrumb} style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                                    <ArrowLeft size={18} />
                                </button>
                            )}
                            {/* Root / Project name */}
                            <span className={styles.breadcrumbCrumb} onClick={() => {
                                const projectId = searchParams?.get('projectId');
                                setCurrentFolder({ id: null, name: 'Root' });
                                setFolderHistory([]);
                                router.push(projectId ? `/?projectId=${projectId}` : '/');
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
                                                if (ancestor.id) {
                                                    router.push(`/?folderId=${ancestor.id}${projectId ? `&projectId=${projectId}` : ''}`);
                                                } else {
                                                    router.push(projectId ? `/?projectId=${projectId}` : '/');
                                                }
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
                                    <ChevronRight size={14} style={{ color: 'var(--text-light)', margin: '0 2px', flexShrink: 0 }} />
                                    <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>{currentFolder.name}</span>
                                </>
                            )}
                        </>
                    )}
                </div>

                {isGlobalRoot && projectRole === 'admin' && (
                    <div style={{ padding: '10px 16px', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '8px', color: '#1e40af', fontSize: '0.9rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
                        <div>
                            <strong>Global View:</strong> You are viewing files outside of any project. Select a project from the sidebar for better organization.
                        </div>
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

            <div className={styles.content} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, currentFolder.id)}>
                {loading ? (
                    <div className={styles.emptyState}>Loading...</div>
                ) : (
                    <>
                        <div className={styles.listHeader}>
                            <div>Name</div>
                            <div>Modified</div>
                            <div>File Size</div>
                        </div>

                        {nodes.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Folder size={48} color="var(--border-color)" />
                                <p>This folder is empty.</p>
                            </div>
                        ) : (
                            nodes.map(node => (
                                <div
                                    key={node.id}
                                    className={`${styles.listItem} ${styles.rowHover}`}
                                    draggable={projectRole !== 'read_only'}
                                    onDragStart={(e) => handleDragStart(e, node)}
                                    // if it's a folder, it can receive drops
                                    onDragOver={node.type === 'folder' ? handleDragOver : undefined}
                                    onDrop={node.type === 'folder' ? (e) => {
                                        e.stopPropagation(); // don't bubble up to the root content area
                                        handleDrop(e, node.id);
                                    } : undefined}
                                    onClick={() => navigateToFolder(node)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setContextMenu({ x: e.clientX, y: e.clientY, node });
                                    }}
                                >
                                    <div className={styles.nameCol}>
                                        <div className={styles.iconWrapper}>
                                            {node.type === 'folder' ? (
                                                <Folder size={20} color="var(--primary-color)" fill="var(--primary-color)" fillOpacity={0.2} />
                                            ) : (
                                                getFileIcon(node.mime_type)
                                            )}
                                        </div>
                                        {node.name}
                                    </div>
                                    <div style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
                                        {new Date(node.updated_at).toLocaleDateString()}
                                    </div>
                                    <div style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
                                        {formatSize(node.size)}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>

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
                                                <div key={link.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-color)', padding: '8px 12px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.8rem' }}>
                                                        <div>Created: {new Date(link.created_at).toLocaleDateString()}</div>
                                                        {link.expires_at ? (
                                                            <div style={{ color: new Date(link.expires_at) < new Date() ? '#ef4444' : 'var(--text-light)' }}>
                                                                Expires: {new Date(link.expires_at).toLocaleDateString()}
                                                            </div>
                                                        ) : (
                                                            <div style={{ color: 'var(--text-light)' }}>Never Expires</div>
                                                        )}
                                                    </div>
                                                    <button
                                                        className={styles.secondaryBtn}
                                                        style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: '#ef4444', color: '#ef4444' }}
                                                        onClick={() => handleRevokeShareLink(link.id)}
                                                    >
                                                        Revoke
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{ background: '#f0fdf4', color: '#166534', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.95rem' }}>
                                    Link generated successfully!
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

            {/* Transfer Queue UI */}
            {transfers.length > 0 && showTransfers && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    width: '350px',
                    background: 'var(--surface-color)',
                    boxShadow: 'var(--shadow-md)',
                    borderRadius: '8px',
                    zIndex: 1000,
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <div style={{ background: 'var(--primary-color)', color: '#fff', padding: '12px 16px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Transfers ({transfers.filter(t => t.status === 'completed').length}/{transfers.length})</span>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setShowTransfers(false)} style={{ color: '#fff', opacity: 0.8 }} title="Minimize">_</button>
                            <button onClick={() => setTransfers([])} style={{ color: '#fff', opacity: 0.8 }} title="Close">✕</button>
                        </div>
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {transfers.map(task => (
                            <div key={task.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '0.9rem', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-dark)' }}>
                                    {task.name}
                                </div>
                                {task.status === 'running' && (
                                    <div style={{ height: '6px', background: 'var(--bg-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', background: 'var(--primary-color)', width: `${Math.max(5, task.progress)}%`, transition: 'width 0.2s' }} />
                                    </div>
                                )}
                                {task.status === 'completed' && <div style={{ fontSize: '0.85rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>✓ Completed</div>}
                                {task.status === 'error' && <div style={{ fontSize: '0.85rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>✕ Failed</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {!showTransfers && transfers.length > 0 && (
                <button
                    onClick={() => setShowTransfers(true)}
                    style={{
                        position: 'fixed', bottom: '24px', right: '24px', padding: '12px 24px',
                        background: 'var(--surface-color)', color: 'var(--primary-color)', borderRadius: '24px',
                        boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', fontWeight: 600, zIndex: 1000
                    }}
                >
                    Show Transfers ({transfers.filter(t => t.status === 'running').length} running)
                </button>
            )}

            {/* Context Menu Popup */}
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: 'var(--surface-color)',
                        boxShadow: 'var(--shadow-lg)',
                        borderRadius: 'var(--radius-md)',
                        padding: '4px',
                        zIndex: 99999,
                        minWidth: '180px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)', borderBottom: '1px solid var(--border-color)', marginBottom: '4px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {contextMenu.node.name}
                    </div>
                    {(searchParams?.get('search') || searchParams?.get('recent') === 'true') && (
                        <button className={styles.contextMenuBtn} onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu(null);
                            if (contextMenu.node.parent_id) {
                                router.push(`/?folderId=${contextMenu.node.parent_id}`);
                            } else {
                                router.push(`/`);
                            }
                        }}>
                            <ExternalLink size={16} /> Go to Path
                        </button>
                    )}
                    {contextMenu.node.type === 'file' && (
                        <button className={styles.contextMenuBtn} onClick={(e) => { handleDownload(e, contextMenu.node); setContextMenu(null); }}>
                            <DownloadCloud size={16} /> Download
                        </button>
                    )}
                    {contextMenu.node.type === 'folder' && (
                        <>
                            <button className={styles.contextMenuBtn} onClick={(e) => { handleDownloadFolder(e, contextMenu.node); setContextMenu(null); }}>
                                <DownloadCloud size={16} /> Download
                            </button>
                            <button className={styles.contextMenuBtn} onClick={(e) => {
                                e.stopPropagation();
                                const url = `${window.location.origin}/?folderId=${contextMenu.node.id}`;
                                navigator.clipboard.writeText(url);
                                showToast('Direct link copied!', 'success');
                                setContextMenu(null);
                            }}>
                                <LinkIcon size={16} /> Copy Link
                            </button>
                        </>
                    )}
                    <button className={styles.contextMenuBtn} onClick={(e) => { openShareModal(e, contextMenu.node); setContextMenu(null); }}>
                        <Share2 size={16} /> Share
                    </button>
                    {projectRole !== 'read_only' && (
                        <>
                            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                            <button className={styles.contextMenuBtn} onClick={(e) => {
                                e.stopPropagation();
                                setRenameNodeData(contextMenu.node);
                                setEditName(contextMenu.node.name);
                                setContextMenu(null);
                            }}>
                                <Edit2 size={16} /> Rename
                            </button>
                            <button className={styles.contextMenuBtn} onClick={(e) => {
                                e.stopPropagation();
                                setMoveNodeData(contextMenu.node);
                                setContextMenu(null);
                            }}>
                                <MoveRight size={16} /> Move To
                            </button>
                            <button className={styles.contextMenuBtn} style={{ color: '#ef4444' }} onClick={(e) => { handleDelete(e, contextMenu.node); setContextMenu(null); }}>
                                <Trash2 size={16} /> Delete
                            </button>
                        </>
                    )}
                </div>
            )}
            {/* Folder Upload Confirmation Modal */}
            {pendingFolderUpload && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ background: 'var(--surface-color)', padding: '32px', borderRadius: '20px', width: '450px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                        <div style={{ width: '80px', height: '80px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <UploadCloud size={40} color="var(--primary-color)" />
                        </div>

                        <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)' }}>Confirm Upload</h2>
                        <p style={{ margin: '0 0 24px', color: 'var(--text-light)', lineHeight: 1.5 }}>
                            You are about to upload the folder <strong style={{ color: 'var(--text-dark)' }}>"{pendingFolderUpload.folderName}"</strong> containing <strong style={{ color: 'var(--primary-color)' }}>{pendingFolderUpload.files.length}</strong> files.
                        </p>

                        <div style={{ background: 'var(--bg-color)', padding: '16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ color: 'var(--text-light)', marginBottom: '4px' }}>Total Size</div>
                                <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{formatSize(pendingFolderUpload.totalSize)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: 'var(--text-light)', marginBottom: '4px' }}>Destination</div>
                                <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{currentFolder.name}</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => {
                                    setPendingFolderUpload(null);
                                    if (folderInputRef.current) folderInputRef.current.value = '';
                                }}
                                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontWeight: 600, color: 'var(--text-dark)', transition: 'all 0.2s' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={processFolderUpload}
                                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'var(--primary-color)', color: 'white', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', transition: 'all 0.2s' }}
                            >
                                Start Upload
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
