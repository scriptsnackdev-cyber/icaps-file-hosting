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

function getFileColorClass(ext: string): string {
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return "bg-purple-50 text-purple-600";
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return "bg-orange-50 text-orange-600";
    if (['mp3', 'wav', 'ogg'].includes(ext)) return "bg-pink-50 text-pink-600";
    if (['pdf'].includes(ext)) return "bg-red-50 text-red-600";
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return "bg-amber-50 text-amber-600";
    if (['xls', 'xlsx', 'csv'].includes(ext)) return "bg-emerald-50 text-emerald-600";
    if (['doc', 'docx'].includes(ext)) return "bg-blue-50 text-blue-600";
    if (['ppt', 'pptx'].includes(ext)) return "bg-rose-50 text-rose-600";
    if (['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'java', 'html', 'css', 'php', 'c', 'cpp'].includes(ext)) return "bg-slate-100 text-slate-600 border border-slate-200";
    if (ext === 'splan') return "bg-indigo-50 text-indigo-600 border border-indigo-100";
    return "bg-blue-50 text-blue-600";
}

function NodeIcon({ node }: { node: StorageNode }) {
    if (node.type === 'FOLDER') {
        return (
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-indigo-100 group-hover:scale-105 transition-all shrink-0">
                <Folder className="w-5 h-5 fill-current" />
            </div>
        );
    }
    const ext = node.name.split('.').pop()?.toLowerCase() || '';
    const colorClass = getFileColorClass(ext);
    return (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm transition-all group-hover:scale-105 shrink-0 ${colorClass}`}>
            {ext === 'splan' ? <Calendar className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
        </div>
    );
}

function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const isToday = date.toDateString() === new Date().toDateString();
    return isToday ? `Today ${format(date, 'HH:mm')}` : format(date, 'MMM d, yyyy');
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
            <>
                {/* Desktop skeleton */}
                <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                {/* Mobile skeleton */}
                <div className="md:hidden space-y-2">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3 animate-pulse">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-slate-100 rounded w-3/4" />
                                <div className="h-3 bg-slate-50 rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            </>
        );
    }

    // Empty state
    if (!loading && nodes.length === 0 && !isCreatingFolder) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-24 text-center">
                <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 animate-in zoom-in-50 duration-300">
                        <Cloud className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">It&apos;s a bit empty here</h3>
                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                        Drag and drop files directly to this page or use the button below to get started.
                    </p>
                    <div className="flex gap-4 flex-wrap justify-center">
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
            </div>
        );
    }

    // Drag/drop helpers shared between table rows and cards
    const makeDragProps = (node: StorageNode) => ({
        draggable: isAdmin || node.owner_email === userEmail,
        onDragStart: (e: React.DragEvent) => {
            if (!(isAdmin || node.owner_email === userEmail)) { e.preventDefault(); return; }
            setDraggedNode(node);
            e.dataTransfer.effectAllowed = 'move';
        },
        onDragOver: (e: React.DragEvent) => {
            if (draggedNode && node.type === 'FOLDER' && node.id !== draggedNode.id) {
                e.preventDefault(); e.stopPropagation();
                setDragOverNodeId(node.id);
                e.dataTransfer.dropEffect = 'move';
            }
        },
        onDragLeave: () => { if (dragOverNodeId === node.id) setDragOverNodeId(null); },
        onDrop: async (e: React.DragEvent) => {
            e.preventDefault(); e.stopPropagation();
            setDragOverNodeId(null);
            if (draggedNode && node.type === 'FOLDER' && node.id !== draggedNode.id) {
                if (selectedNodeIds.has(draggedNode.id)) {
                    const itemsToMove = nodes.filter(n => selectedNodeIds.has(n.id));
                    for (const item of itemsToMove) {
                        if (item.id !== node.id) await handleMoveNode(item, node.id);
                    }
                    showToast(`Moved ${itemsToMove.length} items`, "success");
                } else {
                    handleMoveNode(draggedNode, node.id);
                }
                setDraggedNode(null); setSelectedNodeIds(new Set());
                return;
            }
            if (node.type === 'FOLDER' && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                (window as any).dispatchEvent(new CustomEvent('folder-drop-upload', {
                    detail: { files: e.dataTransfer, targetFolderId: node.id }
                }));
            }
        },
        onMouseEnter: () => { if (node.type === 'FOLDER') prefetchFolder(node); },
    });

    const handleNodeClick = (node: StorageNode) => {
        if (node.type === 'FOLDER') navigateToFolder(node);
        else handlePreview(node);
    };

    return (
        <>
            {/* ── Desktop Table view ── */}
            <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden z-0 relative">
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

                        {sortedNodes.map((node) => (
                            <tr
                                key={node.id}
                                {...makeDragProps(node)}
                                className={`group transition-all cursor-pointer duration-200 ${dragOverNodeId === node.id ? 'bg-blue-100 ring-2 ring-inset ring-blue-500 z-10' : 'hover:bg-blue-50/40'}`}
                                onClick={() => handleNodeClick(node)}
                                onContextMenu={(e) => handleContextMenu(e, node)}
                            >
                                <td className="px-6 py-3 relative z-20">
                                    <input
                                        type="checkbox"
                                        checked={selectedNodeIds.has(node.id)}
                                        onChange={(e) => { e.stopPropagation(); toggleNodeSelection(node.id); }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                                    />
                                </td>
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-4">
                                        <NodeIcon node={node} />
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
                                    {formatDate(node.updated_at)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {(hasMore || isFetchingMore) && (
                    <div ref={loadMoreRef} className="py-12 flex flex-col items-center justify-center gap-3 bg-slate-50/50 border-t border-slate-100">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <p className="text-sm font-medium text-slate-400 animate-pulse">
                            {isFetchingMore ? 'Loading next chunk...' : 'Scroll for more'}
                        </p>
                    </div>
                )}
            </div>

            {/* ── Mobile Card List view ── */}
            <div className="md:hidden">
                {/* Sort + Select-all bar */}
                <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-2 mb-2 shadow-sm">
                    <label className="flex items-center gap-2 text-xs text-slate-500 font-medium cursor-pointer select-none">
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
                        {selectedNodeIds.size > 0 ? `${selectedNodeIds.size} selected` : 'Select all'}
                    </label>
                    <div className="flex items-center gap-2">
                        <button onClick={() => handleSort('name')} className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${sortConfig.key === 'name' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                            Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </button>
                        <button onClick={() => handleSort('updated_at')} className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${sortConfig.key === 'updated_at' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                            Date {sortConfig.key === 'updated_at' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </button>
                    </div>
                </div>

                {/* New Folder input on mobile */}
                <AnimatePresence>
                    {isCreatingFolder && (
                        <motion.div
                            key="new-folder-mobile"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-2 flex items-center gap-3"
                        >
                            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                                <Folder className="w-5 h-5 fill-current" />
                            </div>
                            <input
                                ref={newFolderInputRef}
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={handleNewFolderKeyDown}
                                onBlur={() => confirmCreateFolder()}
                                className="flex-1 text-sm border border-blue-400 bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                                placeholder="Folder Name"
                                autoFocus
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Card items */}
                <div className="space-y-1.5">
                    {sortedNodes.map((node) => (
                        <div
                            key={node.id}
                            {...makeDragProps(node)}
                            className={`group bg-white rounded-xl border transition-all cursor-pointer active:scale-[0.99] ${dragOverNodeId === node.id ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300' : selectedNodeIds.has(node.id) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'}`}
                            onClick={() => handleNodeClick(node)}
                            onContextMenu={(e) => handleContextMenu(e, node)}
                        >
                            <div className="flex items-center gap-3 p-3">
                                {/* Checkbox */}
                                <div onClick={(e) => { e.stopPropagation(); toggleNodeSelection(node.id); }} className="shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedNodeIds.has(node.id)}
                                        onChange={() => { }}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                    />
                                </div>

                                <NodeIcon node={node} />

                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-800 truncate text-sm flex items-center gap-1.5 flex-wrap">
                                        {node.name}
                                        {node.version && node.version > 1 && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600 border border-blue-200">
                                                v{node.version}
                                            </span>
                                        )}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                        {node.type === 'FILE' && <span>{(node.size! / 1024).toFixed(1)} KB</span>}
                                        {node.type === 'FILE' && <span>·</span>}
                                        <span>{formatDate(node.updated_at)}</span>
                                        {node.id.startsWith('optimistic-') && (
                                            <span className="flex items-center gap-1 text-blue-500 font-semibold">
                                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                Uploading...
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {(hasMore || isFetchingMore) && (
                    <div ref={loadMoreRef} className="py-10 flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        <p className="text-xs font-medium text-slate-400">
                            {isFetchingMore ? 'Loading more...' : 'Scroll for more'}
                        </p>
                    </div>
                )}
            </div>
        </>
    );
};
