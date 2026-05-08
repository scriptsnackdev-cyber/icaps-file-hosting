'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { DriveNode } from '@/lib/supabase';
import { ensureMultiplePathsExist, saveFileRecord } from '@/app/actions';

export type TransferTask = {
    id: string;
    name: string;
    type: string;
    progress: number;
    status: 'running' | 'completed' | 'error';
    filesDone?: number;
    totalFiles?: number;
    foldersDone?: number;
    totalFolders?: number;
};

type TransferContextType = {
    transfers: TransferTask[];
    showTransfers: boolean;
    setShowTransfers: (show: boolean) => void;
    isUploading: boolean;
    uploadFolder: (files: FileList, folderName: string, currentFolderId: string, projectId?: string, onComplete?: () => void) => Promise<void>;
};

const TransferContext = createContext<TransferContextType | undefined>(undefined);

export function TransferProvider({ children }: { children: React.ReactNode }) {
    const [transfers, setTransfers] = useState<TransferTask[]>([]);
    const [showTransfers, setShowTransfers] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const activeUploadsCount = useRef(0);

    const addTransfer = (id: string, name: string, type: string, totalFiles?: number, totalFolders?: number) => {
        setTransfers(prev => [{
            id, name, type, progress: 0, status: 'running',
            filesDone: totalFiles !== undefined ? 0 : undefined,
            totalFiles,
            foldersDone: totalFolders !== undefined ? 0 : undefined,
            totalFolders
        }, ...prev]);
        setShowTransfers(true);
    };

    const updateTransfer = (id: string, progress: number, filesDone?: number, foldersDone?: number) => {
        setTransfers(prev => prev.map(t => t.id === id ? {
            ...t,
            progress: progress === -1 ? t.progress : progress,
            filesDone: filesDone !== undefined ? filesDone : t.filesDone,
            foldersDone: foldersDone !== undefined ? foldersDone : t.foldersDone
        } : t));
    };

    const completeTransfer = (id: string, status: 'completed' | 'error') => {
        setTransfers(prev => prev.map(t => t.id === id ? { ...t, progress: status === 'completed' ? 100 : t.progress, status } : t));
    };

    // Warn before closing if uploading
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isUploading) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isUploading]);

    const uploadFolder = async (filesList: FileList, folderName: string, currentFolderId: string, projectId?: string, onComplete?: () => void) => {
        const files = Array.from(filesList);
        setIsUploading(true);
        activeUploadsCount.current++;
        const rootTaskId = `folder-up-${Date.now()}`;

        // --- PHASE 1: SCAN ---
        const folderPathsSet = new Set<string>();
        files.forEach(f => {
            const parts = (f as any).webkitRelativePath.split('/');
            parts.pop();
            let currentPath = '';
            parts.forEach(p => {
                currentPath = currentPath ? `${currentPath}/${p}` : p;
                folderPathsSet.add(currentPath);
            });
        });
        const folderPaths = Array.from(folderPathsSet).sort((a, b) => a.split('/').length - b.split('/').length);
        
        addTransfer(rootTaskId, folderName, 'upload', files.length, folderPaths.length);

        try {
            // --- PHASE 2: INFRASTRUCTURE (FOLDERS) ---
            const pathMap = await ensureMultiplePathsExist(folderPaths, currentFolderId, projectId);
            const folderCache = new Map<string, string | null>();
            Object.entries(pathMap).forEach(([path, id]) => folderCache.set(path, id || null));
            updateTransfer(rootTaskId, -1, undefined, folderPaths.length);

            // --- PHASE 3: FILLING (FILES) ---
            let filesDone = 0;
            const sortedFiles = [...files].sort((a, b) => (a as any).webkitRelativePath.localeCompare((b as any).webkitRelativePath));

            const TOTAL_WORKER_LIMIT = 12;
            const LARGE_FILE_LIMIT = 3;
            let activeLargeUploads = 0;
            let fileIndex = 0;

            const uploadWorker = async () => {
                while (fileIndex < sortedFiles.length) {
                    let targetIndex = -1;
                    for (let i = fileIndex; i < sortedFiles.length; i++) {
                        const isLarge = sortedFiles[i].size >= 5 * 1024 * 1024;
                        if (!isLarge || (isLarge && activeLargeUploads < LARGE_FILE_LIMIT)) {
                            if (!(sortedFiles[i] as any)._processing) {
                                targetIndex = i;
                                break;
                            }
                        }
                    }

                    if (targetIndex === -1) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        continue;
                    }

                    const file = sortedFiles[targetIndex];
                    (file as any)._processing = true;
                    const isLarge = file.size >= 5 * 1024 * 1024;
                    if (isLarge) activeLargeUploads++;

                    const parts = (file as any).webkitRelativePath.split('/');
                    const fileName = parts.pop() || file.name;
                    const folderPath = parts.join('/');
                    const targetParentId = folderCache.get(folderPath);
                    const mimeType = file.type || 'application/octet-stream';

                    try {
                        const signRes = await fetch('/api/upload/sign', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fileName, contentType: mimeType, projectId, parentId: targetParentId || null })
                        });

                        if (signRes.ok) {
                            const { uploadUrl, key } = await signRes.json();
                            if (uploadUrl !== 'mock-url') {
                                await new Promise<void>((resolve, reject) => {
                                    const xhr = new XMLHttpRequest();
                                    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Fail')));
                                    xhr.onerror = () => reject(new Error('Net error'));
                                    xhr.open('PUT', uploadUrl);
                                    xhr.setRequestHeader('Content-Type', mimeType);
                                    xhr.send(file);
                                });
                            }
                            await saveFileRecord(fileName, key, file.size, mimeType, targetParentId || null, projectId);
                        }
                    } catch (e) {
                        console.error(`Failed to upload ${fileName}`, e);
                    } finally {
                        if (isLarge) activeLargeUploads--;
                        filesDone++;
                        (file as any)._done = true;
                        const overallProgress = Math.round(((folderPaths.length + filesDone) / (folderPaths.length + files.length)) * 100);
                        updateTransfer(rootTaskId, overallProgress, filesDone);
                    }
                }
            };

            const workers = [];
            for (let i = 0; i < Math.min(TOTAL_WORKER_LIMIT, sortedFiles.length); i++) {
                workers.push(uploadWorker());
            }
            await Promise.all(workers);

            completeTransfer(rootTaskId, 'completed');
            if (onComplete) onComplete();
        } catch (err) {
            console.error(err);
            completeTransfer(rootTaskId, 'error');
        } finally {
            activeUploadsCount.current--;
            if (activeUploadsCount.current === 0) setIsUploading(false);
        }
    };

    return (
        <TransferContext.Provider value={{ transfers, showTransfers, setShowTransfers, isUploading, uploadFolder }}>
            {children}
        </TransferContext.Provider>
    );
}

export function useTransfer() {
    const context = useContext(TransferContext);
    if (context === undefined) {
        throw new Error('useTransfer must be used within a TransferProvider');
    }
    return context;
}
