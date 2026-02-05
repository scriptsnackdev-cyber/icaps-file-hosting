'use client';

import React, { useEffect, useRef } from 'react';
import {
    Folder, FileText, Calendar, ArrowUp, ArrowDown, Cloud, Upload, FolderPlus, Loader2
} from 'lucide-react';
import { StorageNode } from '@/types';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface DriveNodesListProps {
    nodes: StorageNode[];
    sortedNodes: StorageNode[];
    loading: boolean;
    isAdmin: boolean;
    userEmail: string | null;
    selectedNodeIds: Set<string>;
    dragOverNodeId: string | null;
    draggedNode: StorageNode | null;
    sortConfig: { key: string, direction: 'asc' | 'desc' };
    isCreatingFolder: boolean;
    newFolderName: string;
    newFolderInputRef: React.RefObject<HTMLInputElement | null>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;

    toggleSelectAll: () => void;
    handleSort: (key: 'name' | 'size' | 'updated_at') => void;
    setNewFolderName: (name: string) => void;
    handleNewFolderKeyDown: (e: React.KeyboardEvent) => void;
    confirmCreateFolder: () => void;
    navigateToFolder: (node: StorageNode) => void;
    handlePreview: (node: StorageNode) => void;
    handleContextMenu: (e: React.MouseEvent, node: StorageNode) => void;
    toggleNodeSelection: (id: string) => void;
    handleCreateFolderClick: () => void;
    setDraggedNode: (node: StorageNode | null) => void;
    setDragOverNodeId: (id: string | null) => void;
    handleMoveNode: (node: StorageNode, parentId: string | null) => Promise<void>;
    setSelectedNodeIds: (ids: Set<string>) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
    prefetchFolder: (node: StorageNode) => void;

    // Chunk Loading
    loadMore: () => void;
    hasMore: boolean;
    isFetchingMore: boolean;
}

export const DriveNodesList: React.FC<DriveNodesListProps> = ({
    nodes,
    sortedNodes,
    loading,
    isAdmin,
    userEmail,
    selectedNodeIds,
    dragOverNodeId,
    draggedNode,
    sortConfig,
    isCreatingFolder,
    newFolderName,
    newFolderInputRef,
    fileInputRef,
    toggleSelectAll,
    handleSort,
    setNewFolderName,
    handleNewFolderKeyDown,
    confirmCreateFolder,
    navigateToFolder,
    handlePreview,
    handleContextMenu,
    toggleNodeSelection,
    handleCreateFolderClick,
    setDraggedNode,
    setDragOverNodeId,
    handleMoveNode,
    setSelectedNodeIds,
    showToast,
    prefetchFolder,
    loadMore,
    hasMore,
    isFetchingMore
}) => {
    const loadMoreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
                    loadMore();
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [hasMore, isFetchingMore, loadMore]);

    if (loading) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden z-0 relative">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                        <tr>
                            <th className="px-6 py-4 w-[50px]"><div className="h-4 w-4 bg-slate-200 rounded animate-pulse" /></th>
                            <th className="px-6 py-4"><div className="h-4 w-20 bg-slate-200 rounded animate-pulse" /></th>
                            <th className="px-6 py-4"><div className="h-4 w-16 bg-slate-200 rounded animate-pulse" /></th>
                            <th className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded animate-pulse" /></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {[...Array(8)].map((_, i) => (
                            <tr key={i}>
                                <td className="px-6 py-4"><div className="h-4 w-4 bg-slate-100 rounded animate-pulse" /></td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg animate-pulse" />
                                        <div className="space-y-2">
                                            <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
                                            <div className="h-3 w-20 bg-slate-50 rounded animate-pulse" />
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></td>
                                <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden z-0 relative">
            <table className="w-full text-left">
                <thead className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-100 text-xs font-semibold uppercase text-slate-500 tracking-wider shadow-sm">
                    <tr>
                        <th className="px-6 py-4 w-[50px]">
                            <input
                                type="checkbox"
                                onChange={toggleSelectAll}
                                checked={selectedNodeIds.size > 0 && selectedNodeIds.size === nodes.length}
                                ref={input => {
                                    if (input) {
                                        input.indeterminate = selectedNodeIds.size > 0 && selectedNodeIds.size < nodes.length;
                                    }
                                }}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group select-none" onClick={() => handleSort('name')}>
                            <div className="flex items-center gap-1">
                                Name
                                {sortConfig.key === 'name' && (
                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4 text-blue-500" /> : <ArrowDown className="w-4 h-4 text-blue-500" />
                                )}
                            </div>
                        </th>
                        <th className="px-6 py-4">Owner</th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group select-none" onClick={() => handleSort('updated_at')}>
                            <div className="flex items-center gap-1">
                                Modified
                                {sortConfig.key === 'updated_at' && (
                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4 text-blue-500" /> : <ArrowDown className="w-4 h-4 text-blue-500" />
                                )}
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {/* New Folder Input Row */}
                    <AnimatePresence mode="popLayout">
                        {isCreatingFolder && (
                            <motion.tr
                                key="new-folder-input"
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-blue-50/50"
                            >
                                <td className="px-6 py-3"></td>
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
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td colSpan={3} className="px-6 py-3 text-xs text-slate-400">
                                    Press Enter to create, Esc to cancel
                                </td>
                            </motion.tr>
                        )}
                    </AnimatePresence>

                    {/* Skeleton Loading State */}
                    {loading && nodes.length === 0 && (
                        <>
                            {[...Array(8)].map((_, i) => (
                                <tr key={`skeleton-${i}`} className="animate-pulse">
                                    <td className="px-6 py-4">
                                        <div className="w-4 h-4 bg-slate-100 rounded"></div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-100 rounded-lg"></div>
                                            <div className="flex flex-col gap-2">
                                                <div className="h-4 bg-slate-100 rounded w-48 sm:w-64"></div>
                                                <div className="h-3 bg-slate-100 rounded w-24"></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-slate-100"></div>
                                            <div className="h-3 bg-slate-100 rounded w-20"></div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="h-3 bg-slate-100 rounded w-24"></div>
                                    </td>
                                </tr>
                            ))}
                        </>
                    )}

                    {!loading && nodes.length === 0 && !isCreatingFolder && (
                        <tr>
                            <td colSpan={5} className="px-6 py-24 text-center">
                                <div className="flex flex-col items-center justify-center">
                                    <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 animate-in zoom-in-50 duration-300">
                                        <Cloud className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2">It's a bit empty here</h3>
                                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                                        Drag and drop files directly to this page or use the button below to get started.
                                    </p>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2"
                                        >
                                            <Upload className="w-4 h-4" />
                                            Upload Files
                                        </button>
                                        <button
                                            onClick={handleCreateFolderClick}
                                            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2"
                                        >
                                            <FolderPlus className="w-4 h-4" />
                                            New Folder
                                        </button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    )}

                    {sortedNodes.map((node) => (
                        <tr
                            key={node.id}
                            draggable={isAdmin || node.owner_email === userEmail}
                            onDragStart={(e: any) => {
                                if (!(isAdmin || node.owner_email === userEmail)) {
                                    e.preventDefault();
                                    return;
                                }
                                setDraggedNode(node);
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e: any) => {
                                if (draggedNode && node.type === 'FOLDER' && node.id !== draggedNode.id) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverNodeId(node.id);
                                    e.dataTransfer.dropEffect = 'move';
                                }
                            }}
                            onDragLeave={(e: any) => {
                                if (dragOverNodeId === node.id) {
                                    setDragOverNodeId(null);
                                }
                            }}
                            onDrop={async (e: any) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverNodeId(null);
                                if (draggedNode && node.type === 'FOLDER' && node.id !== draggedNode.id) {
                                    if (selectedNodeIds.has(draggedNode.id)) {
                                        const itemsToMove = nodes.filter(n => selectedNodeIds.has(n.id));
                                        for (const item of itemsToMove) {
                                            if (item.id !== node.id) {
                                                await handleMoveNode(item, node.id);
                                            }
                                        }
                                        showToast(`Moved ${itemsToMove.length} items`, "success");
                                    } else {
                                        handleMoveNode(draggedNode, node.id);
                                    }
                                    setDraggedNode(null);
                                    setSelectedNodeIds(new Set());
                                }
                            }}
                            onMouseEnter={() => {
                                if (node.type === 'FOLDER') {
                                    prefetchFolder(node);
                                }
                            }}
                            className={`group transition-all cursor-pointer duration-200 ${dragOverNodeId === node.id ? 'bg-blue-100 ring-2 ring-inset ring-blue-500 z-10' : 'hover:bg-blue-50/40'}`}
                            onClick={() => {
                                if (node.type === 'FOLDER') {
                                    navigateToFolder(node);
                                } else {
                                    handlePreview(node);
                                }
                            }}
                            onContextMenu={(e) => handleContextMenu(e, node)}
                        >
                            <td className="px-6 py-3 relative z-20">
                                <input
                                    type="checkbox"
                                    checked={selectedNodeIds.has(node.id)}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        toggleNodeSelection(node.id);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                                />
                            </td>
                            <td className="px-6 py-3">
                                <div className="flex items-center gap-4">
                                    {node.type === 'FOLDER' ? (
                                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-indigo-100 group-hover:scale-105 transition-all">
                                            <Folder className="w-5 h-5 fill-current" />
                                        </div>
                                    ) : (
                                        (() => {
                                            const ext = node.name.split('.').pop()?.toLowerCase() || '';
                                            let colorClass = "bg-blue-50 text-blue-600 group-hover:bg-blue-100";
                                            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) colorClass = "bg-purple-50 text-purple-600 group-hover:bg-purple-100";
                                            else if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) colorClass = "bg-orange-50 text-orange-600 group-hover:bg-orange-100";
                                            else if (['mp3', 'wav', 'ogg'].includes(ext)) colorClass = "bg-pink-50 text-pink-600 group-hover:bg-pink-100";
                                            else if (['pdf'].includes(ext)) colorClass = "bg-red-50 text-red-600 group-hover:bg-red-100";
                                            else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) colorClass = "bg-amber-50 text-amber-600 group-hover:bg-amber-100";
                                            else if (['xls', 'xlsx', 'csv'].includes(ext)) colorClass = "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100";
                                            else if (['doc', 'docx'].includes(ext)) colorClass = "bg-blue-50 text-blue-600 group-hover:bg-blue-100";
                                            else if (['ppt', 'pptx'].includes(ext)) colorClass = "bg-rose-50 text-rose-600 group-hover:bg-rose-100";
                                            else if (['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'java', 'html', 'css', 'php', 'c', 'cpp'].includes(ext)) colorClass = "bg-slate-100 text-slate-600 group-hover:bg-slate-200 border border-slate-200";
                                            else if (ext === 'splan') colorClass = "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 border border-indigo-100";

                                            return (
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm transition-all group-hover:scale-105 ${colorClass}`}>
                                                    {ext === 'splan' ? <Calendar className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                                </div>
                                            );
                                        })()
                                    )}
                                    <div>
                                        <p className="font-medium text-slate-700 group-hover:text-blue-700 transition-colors flex items-center gap-2">
                                            {node.name}
                                            {node.version && node.version > 1 && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600 border border-blue-200">
                                                    v{node.version}
                                                </span>
                                            )}
                                            {node.id.startsWith('optimistic-') && (
                                                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-500 border border-blue-100 animate-pulse">
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                    Uploading...
                                                </span>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {node.type === 'FILE' && (
                                                <p className="text-xs text-slate-400">{(node.size! / 1024).toFixed(1)} KB</p>
                                            )}
                                            {node.id.startsWith('optimistic-') && (
                                                <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500 animate-[shimmer_1.5s_infinite]" style={{ width: '40%' }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-600">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-white shadow-sm">
                                        {node.owner_email?.[0].toUpperCase() || '?'}
                                    </div>
                                    <span className="truncate max-w-[120px] opacity-80">{node.owner_email?.split('@')[0] || 'You'}</span>
                                </div>
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-500 font-mono text-xs">
                                {(() => {
                                    const date = new Date(node.updated_at);
                                    const isToday = date.toDateString() === new Date().toDateString();
                                    return isToday
                                        ? `Today ${format(date, 'HH:mm')}`
                                        : format(date, 'MMM d, yyyy');
                                })()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Infinite Scroll Trigger */}
            {(hasMore || isFetchingMore) && (
                <div
                    ref={loadMoreRef}
                    className="py-12 flex flex-col items-center justify-center gap-3 bg-slate-50/50 border-t border-slate-100"
                >
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <p className="text-sm font-medium text-slate-400 animate-pulse">
                        {isFetchingMore ? 'Loading next chunk...' : 'Scroll for more'}
                    </p>
                </div>
            )}
        </div>
    );
};
