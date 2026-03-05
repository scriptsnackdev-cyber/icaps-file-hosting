'use client';

import React, { useState, useEffect } from 'react';
import { verifyShareLink, getSharedFolderContents, getSharedFileDownloadUrlInside } from '@/app/actions';
import FilePreviewModal from '@/components/FilePreviewModal';
import styles from '@/app/login/login.module.css';
import fmStyles from '@/components/FileManager.module.css';
import { Cloud, Lock, Download, File as FileIcon, AlertCircle, Folder, FileText, Image as ImageIcon, Video, Archive, DownloadCloud, ArrowLeft, CheckSquare, Square, ChevronRight, FolderPlus, UploadCloud } from 'lucide-react';
import type { DriveNode } from '@/lib/supabase';
import Image from 'next/image';

type ClientShareAccessProps = {
    linkId: string;
    details: {
        id: string;
        requiresPassword: boolean;
        fileName: string | null;
        fileSize: number | null;
        mimeType: string | null;
        type: 'file' | 'folder' | null;
    };
    initialDownloadUrl: string | null;
    initialError: string | null;
    initialType: 'file' | 'folder' | null;
    initialFolderId: string | null;
    passedPassword?: string;
}

export default function ClientShareAccess({ linkId, details, initialDownloadUrl, initialError, initialType, initialFolderId, passedPassword }: ClientShareAccessProps) {
    const [password, setPassword] = useState(passedPassword || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(initialError);

    // File state
    const [downloadUrl, setDownloadUrl] = useState<string | null>(initialDownloadUrl);

    // Folder generic state
    const [unlockedType, setUnlockedType] = useState<'file' | 'folder' | null>(initialType);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId);
    const [isDownloadingZip, setIsDownloadingZip] = useState(false);

    // Shared folder navigation state
    const [nodes, setNodes] = useState<DriveNode[]>([]);
    const [folderHistory, setFolderHistory] = useState<{ id: string, name: string }[]>(
        initialFolderId ? [{ id: initialFolderId, name: details.fileName ?? 'Shared Folder' }] : []
    );
    const [loadingNodes, setLoadingNodes] = useState(false);

    // Feature states
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [previewNode, setPreviewNode] = useState<DriveNode | null>(null);

    type TransferTask = { id: string; name: string; type: string; progress: number; status: 'running' | 'completed' | 'error' };
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

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await verifyShareLink(linkId, password);
            if (res.error) {
                setError(res.error);
            } else if (res.success) {
                setUnlockedType(res.type as 'file' | 'folder');
                if (res.type === 'file' && res.downloadUrl) {
                    setDownloadUrl(res.downloadUrl);
                    window.location.href = res.downloadUrl;
                } else if (res.type === 'folder' && res.folderId) {
                    setCurrentFolderId(res.folderId);
                    setFolderHistory([{ id: res.folderId, name: res.name || details.fileName }]);
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // Effect to load folder contents when currentFolderId changes
    useEffect(() => {
        if (unlockedType === 'folder' && currentFolderId) {
            loadFolderContents(currentFolderId);
        }
    }, [currentFolderId, unlockedType]);

    const loadFolderContents = async (folderId: string) => {
        setLoadingNodes(true);
        setError(null);
        try {
            const res = await getSharedFolderContents(linkId, folderId, password);
            if (res.error) {
                setError(res.error);
            } else if (res.success && res.nodes) {
                setNodes(res.nodes);
            }
        } catch (err: unknown) {
            setError('Failed to load folder');
        } finally {
            setLoadingNodes(false);
        }
    };

    const navigateToFolder = (node: DriveNode) => {
        if (node.type !== 'folder') return;
        setFolderHistory(prev => [...prev, { id: node.id, name: node.name }]);
        setCurrentFolderId(node.id);
    };

    const goBack = () => {
        if (folderHistory.length <= 1) return; // Don't go above the shared root
        const newHistory = [...folderHistory];
        newHistory.pop();
        setFolderHistory(newHistory);
        setCurrentFolderId(newHistory[newHistory.length - 1].id);
        setSelectedIds(new Set());
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === nodes.length && nodes.length > 0) setSelectedIds(new Set());
        else setSelectedIds(new Set(nodes.map(n => n.id)));
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
        if (node.type === 'folder') navigateToFolder(node);
        else setPreviewNode(node);
    };

    const handleDownloadInsideFolder = async (e: React.MouseEvent | { stopPropagation: () => void }, fileId: string) => {
        e.stopPropagation();
        try {
            const res = await getSharedFileDownloadUrlInside(linkId, fileId, password);
            if (res.error) {
                alert(res.error);
            } else if (res.success && res.downloadUrl) {
                const taskId = `dl-${Date.now()}`;
                addTransfer(taskId, `Downloading ${res.fileName}`, 'download');

                const xhr = new XMLHttpRequest();
                xhr.responseType = 'blob';
                xhr.onprogress = (ev) => {
                    if (ev.lengthComputable) {
                        updateTransfer(taskId, Math.round((ev.loaded / ev.total) * 100));
                    } else {
                        setTransfers(prev => prev.map(t => t.id === taskId && t.progress < 90 ? { ...t, progress: t.progress + 5 } : t));
                    }
                };
                xhr.onload = () => {
                    if (xhr.status < 300) {
                        const blobUrl = URL.createObjectURL(xhr.response);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = res.fileName || 'download';
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
                xhr.open('GET', res.downloadUrl);
                xhr.send();
            }
        } catch (err) {
            alert('Download failed');
        }
    };

    const triggerFolderZip = (folderId: string, folderName: string) => {
        setIsDownloadingZip(true);
        const taskId = `zip-${Date.now()}-${folderId}`;
        addTransfer(taskId, `Zipping ${folderName} (Browser Download)`, 'download');

        try {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `/api/share/${linkId}/download-zip`;
            form.style.display = 'none';

            const folderIdInput = document.createElement('input');
            folderIdInput.type = 'hidden';
            folderIdInput.name = 'folderId';
            folderIdInput.value = folderId;
            form.appendChild(folderIdInput);

            if (password) {
                const passwordInput = document.createElement('input');
                passwordInput.type = 'hidden';
                passwordInput.name = 'passwordAttempt';
                passwordInput.value = password;
                form.appendChild(passwordInput);
            }

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            setTimeout(() => {
                completeTransfer(taskId, 'completed');
                setIsDownloadingZip(false);
            }, 3000);
        } catch (err) {
            console.error(err);
            completeTransfer(taskId, 'error');
            alert('Download failed');
            setIsDownloadingZip(false);
        }
    };

    const handleTopRightDownload = async () => {
        if (selectedIds.size === 0) return;
        const selectedNodes = nodes.filter(n => selectedIds.has(n.id));

        for (const node of selectedNodes) {
            if (node.type === 'file') {
                await handleDownloadInsideFolder({ stopPropagation: () => { } }, node.id);
            } else {
                triggerFolderZip(node.id, node.name);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        setSelectedIds(new Set());
    };

    const formatSize = (bytes: number | null) => {
        if (bytes === null || bytes === undefined) return '--';
        const mb = bytes / (1024 * 1024);
        if (mb < 1) return (bytes / 1024).toFixed(1) + ' KB';
        return mb.toFixed(1) + ' MB';
    };

    const getFileIcon = (mimeType: string | null) => {
        if (!mimeType) return <FileIcon size={20} className={fmStyles.fileIcon} />;
        if (mimeType.includes('image')) return <ImageIcon size={20} color="#10b981" />;
        if (mimeType.includes('video')) return <Video size={20} color="#f43f5e" />;
        if (mimeType.includes('pdf')) return <FileText size={20} color="#ef4444" />;
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return <Archive size={20} color="#f59e0b" />;
        return <FileIcon size={20} className={fmStyles.fileIcon} />;
    };

    if (!unlockedType) {
        // Render lock screen
        return (
            <div className={styles.container}>
                <div className={`${styles.card} glass`}>
                    <div className={styles.header}>
                        <Cloud color="var(--primary-color)" size={48} />
                        <h1 className={styles.title}>Secure {details.type === 'folder' ? 'Folder' : 'File'} Share</h1>
                        <p className={styles.subtitle}>
                            Someone securely shared a {details.type} with you via ICAPS-CLOUD.
                        </p>
                    </div>

                    {error && <div className={styles.errorBanner}>{error}</div>}

                    <div style={{ background: 'var(--secondary-color)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {details.type === 'folder' ? <Folder size={24} color="var(--primary-color)" fill="var(--primary-color)" fillOpacity={0.2} /> : <FileIcon size={24} color="var(--text-light)" />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {details.fileName || 'Unknown Item'}
                            </div>
                            {details.fileSize !== null && (
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '2px' }}>
                                    {details.type === 'folder' ? 'Total size: ' : ''}{formatSize(details.fileSize)}
                                </div>
                            )}
                        </div>
                    </div>

                    {details.requiresPassword ? (
                        <form onSubmit={handleVerify} className={styles.form}>
                            <div style={{ color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '-10px' }}>
                                <Lock size={16} /> <span>This link is password protected</span>
                            </div>
                            <input
                                type="password"
                                name="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password to unlock"
                                className={styles.input}
                                required
                            />
                            <button type="submit" className={styles.primaryBtn} disabled={loading}>
                                {loading ? 'Unlocking...' : 'Unlock'}
                            </button>
                        </form>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className={styles.errorBanner} style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fcd34d' }}>
                                <AlertCircle size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
                                Security check required.
                            </div>
                            <button onClick={handleVerify} className={styles.primaryBtn} disabled={loading}>
                                {loading ? 'Loading...' : 'Continue'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (unlockedType === 'file') {
        // Render simple single file download
        return (
            <div className={styles.container}>
                <div className={`${styles.card} glass`}>
                    <div className={styles.header}>
                        <Cloud color="var(--primary-color)" size={48} />
                        <h1 className={styles.title}>Download File</h1>
                    </div>

                    {error && <div className={styles.errorBanner}>{error}</div>}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ textAlign: 'center', color: '#10b981', fontWeight: 500 }}>
                            Ready to download!
                        </div>
                        {downloadUrl && (
                            <a href={downloadUrl} className={styles.primaryBtn} style={{ textDecoration: 'none' }}>
                                <Download size={18} />
                                Download File
                            </a>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Render folder explorer UI using fmStyles
    return (
        <>
            <div className={fmStyles.container} style={{ width: '100%', height: '100%', border: 'none', boxShadow: 'none' }}>
                <div className={fmStyles.toolbar} style={{ background: 'transparent' }}>
                    <div className={fmStyles.breadcrumb}>
                        {folderHistory.length > 1 && (
                            <button onClick={goBack} className={fmStyles.breadcrumbCrumb} style={{ padding: '6px', marginRight: 4, display: 'flex', alignItems: 'center', background: 'var(--bg-overlay)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-md)', cursor: 'pointer' }}>
                                <ArrowLeft size={16} color="var(--text-primary)" />
                            </button>
                        )}

                        {folderHistory.map((folder, idx) => (
                            <React.Fragment key={folder.id || idx}>
                                {idx > 0 && <ChevronRight size={14} style={{ color: 'var(--text-light)', margin: '0 2px', flexShrink: 0 }} />}
                                {idx === folderHistory.length - 1 ? (
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{folder.name}</span>
                                ) : (
                                    <span
                                        className={fmStyles.breadcrumbCrumb}
                                        onClick={() => {
                                            const newHistory = folderHistory.slice(0, idx + 1);
                                            setFolderHistory(newHistory);
                                            setCurrentFolderId(folder.id);
                                            setSelectedIds(new Set());
                                        }}
                                    >
                                        {folder.name}
                                    </span>
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    <div className={fmStyles.actions} style={{ marginLeft: 'auto' }}>
                        <button className={fmStyles.secondaryBtn} style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
                            <FolderPlus size={18} />
                            New Folder
                        </button>
                        <button className={fmStyles.secondaryBtn} style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
                            <UploadCloud size={18} />
                            Upload Folder
                        </button>
                        <button
                            className={fmStyles.primaryBtn}
                            onClick={handleTopRightDownload}
                            disabled={isDownloadingZip || selectedIds.size === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                opacity: selectedIds.size === 0 ? 0.5 : 1,
                                cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <Archive size={16} />
                            {isDownloadingZip ? 'Preparing ZIP...' : (selectedIds.size === nodes.length && nodes.length > 0) ? `Download All (${selectedIds.size})` : `Download (${selectedIds.size})`}
                        </button>
                    </div>
                </div>

                <div className={fmStyles.content}>
                    {loadingNodes ? (
                        <div className={fmStyles.loadingState}>
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className={fmStyles.skeletonRow} style={{ opacity: 1 - i * 0.15 }} />
                            ))}
                        </div>
                    ) : nodes.length === 0 ? (
                        <div className={fmStyles.emptyState}>
                            <Folder size={44} color="var(--text-muted)" />
                            <p>This folder is empty.</p>
                        </div>
                    ) : (
                        <>
                            <div className={fmStyles.listHeader}>
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
                            {nodes.map(node => (
                                <div
                                    key={node.id}
                                    className={fmStyles.listItem}
                                    onClick={() => handleNodeClick(node)}
                                    style={{ background: selectedIds.has(node.id) ? 'rgba(99,102,241,0.08)' : undefined }}
                                >
                                    <div className={fmStyles.nameCol}>
                                        <div onClick={(e) => toggleSelect(e, node.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: selectedIds.has(node.id) ? 'var(--brand-end)' : 'var(--border-mid)', marginRight: 12 }}>
                                            {selectedIds.has(node.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </div>
                                        <div className={fmStyles.iconWrapper}>
                                            {node.type === 'folder' ? (
                                                <Folder size={18} color="var(--brand-end)" fill="var(--brand-end)" fillOpacity={0.18} className={fmStyles.folderIcon} />
                                            ) : (
                                                getFileIcon(node.mime_type)
                                            )}
                                        </div>
                                        <span className={fmStyles.nameText}>{node.name}</span>
                                    </div>
                                    <div className={fmStyles.metaCol}>
                                        {new Date(node.updated_at).toLocaleDateString()}
                                    </div>
                                    <div className={fmStyles.metaCol}>
                                        {formatSize(node.size)}
                                    </div>
                                    <div className={fmStyles.rowActions} onClick={e => e.stopPropagation()}>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
            {/* Transfer Queue UI */}
            {
                transfers.length > 0 && showTransfers && (
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
                )
            }
            {
                !showTransfers && transfers.length > 0 && (
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
                )
            }
            {/* ── Multi-select Action Bar ── */}
            {
                selectedIds.size > 0 && (
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
                )
            }

            {/* ── File Preview Modal ── */}
            {
                previewNode && (
                    <FilePreviewModal
                        node={previewNode}
                        onClose={() => setPreviewNode(null)}
                        onDownload={() => {
                            setPreviewNode(null);
                            handleDownloadInsideFolder({ stopPropagation: () => { } } as any, previewNode.id);
                        }}
                    />
                )
            }
        </>
    );
}
