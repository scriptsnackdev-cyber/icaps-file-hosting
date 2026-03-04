'use client';

import { useState, useEffect } from 'react';
import { verifyShareLink, getSharedFolderContents, getSharedFileDownloadUrlInside } from '@/app/actions';
import styles from '@/app/login/login.module.css';
import fmStyles from '@/components/FileManager.module.css';
import { Cloud, Lock, Download, File as FileIcon, AlertCircle, Folder, FileText, Image as ImageIcon, Video, Archive, DownloadCloud, ArrowLeft } from 'lucide-react';
import type { DriveNode } from '@/lib/supabase';

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
    };

    const handleDownloadInsideFolder = async (e: React.MouseEvent, fileId: string) => {
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

    const handleDownloadFolder = async () => {
        if (!currentFolderId) return;
        setIsDownloadingZip(true);
        const folderName = folderHistory[folderHistory.length - 1]?.name || 'Shared Folder';
        const taskId = `zip-${Date.now()}`;
        addTransfer(taskId, `Zipping ${folderName} (Browser Download)`, 'download');

        try {
            // Create a hidden form to submit the POST request and trigger a native browser download
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `/api/share/${linkId}/download-zip`;
            form.style.display = 'none';

            const folderIdInput = document.createElement('input');
            folderIdInput.type = 'hidden';
            folderIdInput.name = 'folderId';
            folderIdInput.value = currentFolderId;
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

            // Since it's a native download, we don't get a callback when it finishes.
            // We'll mark the UI task as complete after a short delay so it doesn't spin forever.
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
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-color)' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Cloud color="var(--primary-color)" size={32} />
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>ICAPS-CLOUD Secure Folder</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', margin: 0 }}>Shared with you</p>
                </div>
            </div>

            <div className={fmStyles.container} style={{ flex: 1, padding: 0, margin: '24px auto', maxWidth: '1000px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
                <div className={fmStyles.toolbar} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--surface-color)' }}>
                    <div className={fmStyles.breadcrumb}>
                        {folderHistory.length > 1 && (
                            <button onClick={goBack} className={fmStyles.breadcrumbCrumb} style={{ marginRight: 8, display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <ArrowLeft size={18} color="var(--text-dark)" />
                            </button>
                        )}
                        <span style={{ color: 'var(--text-dark)', fontWeight: 500 }}>
                            {folderHistory[folderHistory.length - 1]?.name || 'Shared Folder'}
                        </span>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {details.fileSize !== null && folderHistory.length <= 1 && (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', whiteSpace: 'nowrap' }}>
                                📦 {formatSize(details.fileSize)} total
                            </span>
                        )}
                        <button
                            className={fmStyles.secondaryBtn}
                            onClick={handleDownloadFolder}
                            disabled={isDownloadingZip}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <DownloadCloud size={16} />
                            {isDownloadingZip ? 'Preparing ZIP...' : 'Download Folder'}
                        </button>
                    </div>
                </div>

                <div className={fmStyles.content} style={{ background: 'var(--surface-color)' }}>
                    {loadingNodes ? (
                        <div className={fmStyles.emptyState}>Loading contents...</div>
                    ) : nodes.length === 0 ? (
                        <div className={fmStyles.emptyState}>
                            <Folder size={48} color="var(--border-color)" />
                            <p>This folder is empty.</p>
                        </div>
                    ) : (
                        <>
                            <div className={fmStyles.listHeader}>
                                <div>Name</div>
                                <div>Modified</div>
                                <div>File Size</div>
                                <div style={{ textAlign: 'center' }}>Action</div>
                            </div>
                            {nodes.map(node => (
                                <div
                                    key={node.id}
                                    className={fmStyles.listItem}
                                    onClick={() => navigateToFolder(node)}
                                    style={{ cursor: node.type === 'folder' ? 'pointer' : 'default' }}
                                >
                                    <div className={fmStyles.nameCol}>
                                        <div className={fmStyles.iconWrapper}>
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
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                        {node.type === 'file' && (
                                            <button className={fmStyles.itemBtn} onClick={(e) => handleDownloadInsideFolder(e, node.id)} style={{ color: 'var(--primary-color)' }}>
                                                <DownloadCloud size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

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
        </div>
    );
}
