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
    message?: string;
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
    addTransfer: (id: string, name: string, type: string, totalFiles?: number, totalFolders?: number) => void;
    updateTransfer: (id: string, progress: number, filesDone?: number, foldersDone?: number, message?: string) => void;
    completeTransfer: (id: string, status: 'completed' | 'error') => void;
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

    const updateTransfer = (id: string, progress: number, filesDone?: number, foldersDone?: number, message?: string) => {
        setTransfers(prev => prev.map(t => t.id === id ? {
            ...t,
            progress: progress === -2 ? Math.min(95, t.progress + 5) : (progress === -1 ? t.progress : progress),
            filesDone: filesDone !== undefined ? filesDone : t.filesDone,
            foldersDone: foldersDone !== undefined ? foldersDone : t.foldersDone,
            message: message !== undefined ? message : t.message
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
        const allFiles = Array.from(filesList);
        // Filter out Excel temporary/lock files (starting with ~$)
        const files = allFiles.filter(f => !f.name.startsWith('~$'));
        if (files.length === 0) return;

        setIsUploading(true);
        activeUploadsCount.current++;
        const rootTaskId = `folder-up-${Date.now()}`;

        // --- PHASE 1: SCAN ---
        const folderPathsSet = new Set<string>();
        files.forEach(f => {
            const relPath = (f as any).webkitRelativePath || f.name;
            const parts = relPath.split('/');
            if (parts.length > 1) {
                parts.pop();
                let currentPath = '';
                parts.forEach((p: string) => {
                    currentPath = currentPath ? `${currentPath}/${p}` : p;
                    folderPathsSet.add(currentPath);
                });
            }
        });
        const folderPaths = Array.from(folderPathsSet).sort((a, b) => a.split('/').length - b.split('/').length);
        
        addTransfer(rootTaskId, folderName, 'upload', files.length, folderPaths.length);
        updateTransfer(rootTaskId, 0, undefined, undefined, 'Preparing folder structure...');

        try {
            // --- PHASE 2: INFRASTRUCTURE (FOLDERS) ---
            const pathMap = await ensureMultiplePathsExist(folderPaths, currentFolderId, projectId);
            const folderCache = new Map<string, string | null>();
            Object.entries(pathMap).forEach(([path, id]) => folderCache.set(path, id || null));
            updateTransfer(rootTaskId, 5, undefined, folderPaths.length, `Creating files (0/${files.length})...`);

            // --- PHASE 3: FILLING (FILES) ---
            let filesDone = 0;
            let hasError = false;
            const sortedFiles = [...files].sort((a, b) => {
                const pathA = (a as any).webkitRelativePath || a.name;
                const pathB = (b as any).webkitRelativePath || b.name;
                return pathA.localeCompare(pathB);
            });

            const TOTAL_WORKER_LIMIT = 6;
            const LARGE_FILE_LIMIT = 2;
            let activeLargeUploads = 0;

            const uploadWorker = async (index: number) => {
                // Stagger starts slightly
                await new Promise(resolve => setTimeout(resolve, index * 100));

                while (true) {
                    let targetIndex = -1;
                    
                    // Find next available file (with a simple lock)
                    for (let i = 0; i < sortedFiles.length; i++) {
                        const f = sortedFiles[i];
                        if ((f as any)._processing || (f as any)._done) continue;
                        
                        const isLarge = f.size >= 5 * 1024 * 1024;
                        if (!isLarge || (isLarge && activeLargeUploads < LARGE_FILE_LIMIT)) {
                            (f as any)._processing = true; // Lock it immediately
                            targetIndex = i;
                            break;
                        }
                    }

                    if (targetIndex === -1) {
                        const anyLeft = sortedFiles.some(f => !(f as any)._processing && !(f as any)._done);
                        if (!anyLeft) break;
                        await new Promise(resolve => setTimeout(resolve, 200));
                        continue;
                    }

                    const file = sortedFiles[targetIndex];
                    const isLarge = file.size >= 5 * 1024 * 1024;
                    if (isLarge) activeLargeUploads++;

                    const relPath = (file as any).webkitRelativePath || file.name;
                    const parts = relPath.split('/');
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
                                    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
                                    xhr.onerror = () => reject(new Error('Network error'));
                                    xhr.open('PUT', uploadUrl);
                                    xhr.setRequestHeader('Content-Type', mimeType);
                                    xhr.send(file);
                                });
                            }
                            await saveFileRecord(fileName, key, file.size, mimeType, targetParentId || null, projectId);
                        } else {
                            const errData = await signRes.json().catch(() => ({}));
                            throw new Error(errData.error || `Sign failed: ${signRes.status}`);
                        }
                    } catch (e: any) {
                        console.error(`Failed to upload ${fileName}`, e);
                        hasError = true;
                        completeTransfer(rootTaskId, 'error');
                        updateTransfer(rootTaskId, -1, undefined, undefined, `Error: ${e.message || 'Upload failed'}`);
                        // We continue with other files but the root task is already marked as error
                    } finally {
                        if (isLarge) activeLargeUploads--;
                        (file as any)._done = true;
                        filesDone++;
                        const overallProgress = Math.round(((folderPaths.length + filesDone) / (folderPaths.length + files.length)) * 100);
                        updateTransfer(rootTaskId, overallProgress, filesDone, undefined, `Uploading (${filesDone}/${files.length})...`);
                    }
                }
            };

            const workers = [];
            const workerCount = Math.min(TOTAL_WORKER_LIMIT, sortedFiles.length);
            for (let i = 0; i < workerCount; i++) {
                workers.push(uploadWorker(i));
            }
            await Promise.all(workers);

            completeTransfer(rootTaskId, hasError ? 'error' : 'completed');
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
        <TransferContext.Provider value={{ 
            transfers, showTransfers, setShowTransfers, isUploading, uploadFolder,
            addTransfer, updateTransfer, completeTransfer 
        }}>
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
