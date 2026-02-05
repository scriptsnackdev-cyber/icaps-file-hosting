import React, { useState, useEffect } from 'react';
import { StorageNode, Project } from '@/types';
import { Folder, ChevronRight, ArrowLeft, Loader2, Check } from 'lucide-react';

export interface MoveToModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodesToMove: StorageNode[]; // Supports bulk
    projectId: string;
    onMove: (targetFolderId: string | null) => Promise<void>; // null for root
}

export default function MoveToModal({ isOpen, onClose, nodesToMove, projectId, onMove }: MoveToModalProps) {
    const [currentBoundFolderId, setCurrentBoundFolderId] = useState<string | null>(null);
    const [folders, setFolders] = useState<StorageNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([{ id: null, name: 'Project Root' }]);
    const [isMoving, setIsMoving] = useState(false);

    // Fetch folders when bound folder changes
    useEffect(() => {
        if (!isOpen) return;

        const fetchFolders = async () => {
            setLoading(true);
            try {
                let url = `/api/drive?project=${projectId}`;
                if (currentBoundFolderId) {
                    // We need to fetch children of this folder.
                    // The main API fetches children if we find the folder by path or filter?
                    // Wait, the main API logic is complex with paths.
                    // But we can filter by parent_id directly using standard Supabase client if we had it, strictly speaking we are CLIENT side here.
                    // So we must use the API. 
                    // Our API uses 'path' param to find folder, then lists children.
                    // Or 'parentId'. Let's check api/drive/route.ts again.
                    // Line 9: const parentId = searchParams.get('parentId');
                    // Line 48: if(parentId) query = query.eq('parent_id', parentId)
                    // So we can just use parentId param!
                    url += `&parentId=${currentBoundFolderId}`;
                } else {
                    // Root - do not append parentId, so the API queries for parent_id IS NULL
                }

                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    // data.nodes contains files and folders. We only want folders.
                    setFolders(data.nodes.filter((n: StorageNode) => n.type === 'FOLDER'));
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchFolders();
    }, [isOpen, currentBoundFolderId, projectId]);

    const handleEnterFolder = (folder: StorageNode) => {
        setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
        setCurrentBoundFolderId(folder.id);
    };

    const handleNavigateUp = () => {
        if (breadcrumbs.length <= 1) return;
        const newBreadcrumbs = breadcrumbs.slice(0, -1);
        setBreadcrumbs(newBreadcrumbs);
        setCurrentBoundFolderId(newBreadcrumbs[newBreadcrumbs.length - 1].id);
    };

    const handleConfirm = async () => {
        if (isMoving) return;
        setIsMoving(true);
        try {
            await onMove(currentBoundFolderId);
            onClose();
        } catch (e) {
            // Error handling handled by parent
        } finally {
            setIsMoving(false);
        }
    };

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setCurrentBoundFolderId(null);
            setBreadcrumbs([{ id: null, name: 'Project Root' }]);
            setFolders([]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const currentFolderName = breadcrumbs[breadcrumbs.length - 1].name;
    const isSourceHere = nodesToMove.length === 1 && nodesToMove[0].id === currentBoundFolderId; // Moving folder into itself? No, moving folder INTO.
    // Check if we are inside one of the folders we are moving?
    const isMovingIntoSelf = nodesToMove.some(n => n.id === currentBoundFolderId);

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-semibold text-slate-800">Move {nodesToMove.length} item{nodesToMove.length !== 1 ? 's' : ''}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <span className="sr-only">Close</span>
                        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                </div>

                {/* Navigation Bar */}
                <div className="p-3 bg-white border-b border-slate-100 flex items-center gap-2">
                    {breadcrumbs.length > 1 && (
                        <button onClick={handleNavigateUp} className="p-1 hover:bg-slate-100 rounded-full text-slate-600">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <span className="font-medium text-slate-700 truncate">{currentFolderName}</span>
                </div>

                {/* Folder List */}
                <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
                    {loading ? (
                        <div className="flex justify-center items-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {folders.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-sm">
                                    No subfolders
                                </div>
                            ) : (
                                folders.map(folder => {
                                    const isDisabled = nodesToMove.some(n => n.id === folder.id); // Cannot move folder into itself
                                    return (
                                        <button
                                            key={folder.id}
                                            onClick={() => !isDisabled && handleEnterFolder(folder)}
                                            disabled={isDisabled}
                                            className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${isDisabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-blue-50 group'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Folder className={`w-5 h-5 ${isDisabled ? 'text-slate-400' : 'text-slate-500 group-hover:text-blue-500'}`} />
                                                <span className={`text-sm ${isDisabled ? 'text-slate-400' : 'text-slate-700 group-hover:text-blue-700'}`}>{folder.name}</span>
                                            </div>
                                            {!isDisabled && <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isMoving || isMovingIntoSelf}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isMoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Move Here
                    </button>
                </div>
            </div>
        </div>
    );
}
