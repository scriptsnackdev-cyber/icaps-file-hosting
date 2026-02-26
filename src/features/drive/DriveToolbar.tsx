'use client';

import React from 'react';
import {
    ChevronRight, Home as HomeIcon, Share2, Download, Plus, FolderPlus,
    FileText, Calendar, Upload, FolderUp, Lock, Loader2
} from 'lucide-react';
import { StorageNode, Project } from '@/types';

interface DriveToolbarProps {
    currentProject: Project | null;
    currentFolderId: string | null;
    selectedNodeIds: Set<string>;
    isAdmin: boolean;
    userId: string | null;
    userEmail: string | null;
    slug: string[] | undefined;
    breadcrumbsToRender: { id: string, name: string }[];
    isDownloading: boolean;
    isUploadMenuOpen: boolean;
    setIsUploadMenuOpen: (open: boolean) => void;
    draggedNode: StorageNode | null;
    setDraggedNode: (node: StorageNode | null) => void;
    setSelectedNodeIds: (ids: Set<string>) => void;
    handleShareClick: () => void;
    handleMainDownload: () => void;
    handleCreateFolderClick: () => void;
    setIsCreateNoteModalOpen: (open: boolean) => void;
    handleCreatePlannerClick: () => void;
    triggerFolderUploadSelection: () => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    navigateUp: (index: number) => void;
    handleMoveNode: (node: StorageNode, parentId: string | null) => Promise<void>;
    nodes: StorageNode[];
}

export const DriveToolbar: React.FC<DriveToolbarProps> = ({
    currentProject,
    currentFolderId,
    selectedNodeIds,
    isAdmin,
    userEmail,
    slug,
    breadcrumbsToRender,
    isDownloading,
    isUploadMenuOpen,
    setIsUploadMenuOpen,
    draggedNode,
    setDraggedNode,
    setSelectedNodeIds,
    handleShareClick,
    handleMainDownload,
    handleCreateFolderClick,
    setIsCreateNoteModalOpen,
    handleCreatePlannerClick,
    triggerFolderUploadSelection,
    fileInputRef,
    navigateUp,
    handleMoveNode,
    nodes
}) => {
    const isReadOnly = currentProject?.settings?.read_only && !isAdmin;

    return (
        <div className="flex flex-col gap-2 mb-4 md:mb-6 relative z-20">
            {/* ── Row 1: Breadcrumbs ── */}
            <div className="flex items-center gap-1 text-xs text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm overflow-x-auto min-w-0 no-scrollbar">
                <button
                    onClick={() => navigateUp(-1)}
                    onDragOver={(e) => {
                        if (draggedNode && draggedNode.parent_id !== null) {
                            e.preventDefault(); e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                        }
                    }}
                    onDrop={async (e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (draggedNode && draggedNode.parent_id !== null) {
                            if (selectedNodeIds.has(draggedNode.id)) {
                                const itemsToMove = nodes.filter(n => selectedNodeIds.has(n.id));
                                for (const item of itemsToMove) {
                                    if (item.parent_id !== null) await handleMoveNode(item, null);
                                }
                            } else {
                                await handleMoveNode(draggedNode, null);
                            }
                            setDraggedNode(null); setSelectedNodeIds(new Set());
                        }
                    }}
                    className={`flex items-center gap-1 hover:text-blue-600 px-2 py-1 rounded-full transition-colors shrink-0 ${!slug || slug.length === 0 ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`}
                >
                    <HomeIcon className="w-3.5 h-3.5" />
                    <span>My Files</span>
                </button>
                {breadcrumbsToRender.map((f, i) => (
                    <React.Fragment key={f.id}>
                        <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                        <button
                            onClick={() => navigateUp(i)}
                            onDragOver={(e) => {
                                if (draggedNode && draggedNode.id !== f.id && draggedNode.parent_id !== f.id) {
                                    e.preventDefault(); e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'move';
                                }
                            }}
                            onDrop={async (e) => {
                                e.preventDefault(); e.stopPropagation();
                                if (draggedNode && draggedNode.id !== f.id && draggedNode.parent_id !== f.id) {
                                    if (selectedNodeIds.has(draggedNode.id)) {
                                        const itemsToMove = nodes.filter(n => selectedNodeIds.has(n.id));
                                        for (const item of itemsToMove) {
                                            if (item.id !== f.id && item.parent_id !== f.id) await handleMoveNode(item, f.id);
                                        }
                                    } else {
                                        await handleMoveNode(draggedNode, f.id);
                                    }
                                    setDraggedNode(null); setSelectedNodeIds(new Set());
                                }
                            }}
                            className={`hover:text-blue-600 px-2 py-1 rounded-full transition-colors whitespace-nowrap shrink-0 flex items-center ${i === breadcrumbsToRender.length - 1 ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`}
                        >
                            <span className="max-w-[80px] sm:max-w-[150px] truncate">{f.name}</span>
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* ── Row 2: Action buttons ── */}
            <div className="flex items-center gap-2 justify-between bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                {/* Left: Quota (hidden on very small) */}
                {currentProject && (
                    <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400">
                        <span>Quota:</span>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all ${(currentProject.current_storage_bytes / currentProject.max_storage_bytes) > 0.9 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(100, (currentProject.current_storage_bytes / currentProject.max_storage_bytes) * 100)}%` }}
                            />
                        </div>
                        <span className="font-medium text-slate-600">
                            {(currentProject.current_storage_bytes / (1024 * 1024)).toFixed(1)}M / {(currentProject.max_storage_bytes / (1024 * 1024)).toFixed(0)}M
                        </span>
                    </div>
                )}

                {/* Right: Action buttons */}
                <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                    <button
                        onClick={handleShareClick}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-slate-700 rounded-lg border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-xs font-medium shadow-sm"
                    >
                        <Share2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Share</span>
                    </button>
                    <button
                        onClick={handleMainDownload}
                        disabled={(!currentFolderId && selectedNodeIds.size === 0) || isDownloading}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-slate-600 rounded-lg border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-xs font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">Download</span>
                    </button>

                    {isReadOnly ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-200 text-[10px] font-bold uppercase tracking-wider">
                            <Lock className="w-3 h-3" />
                            Locked
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={handleCreateFolderClick}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-slate-600 rounded-lg border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-xs font-medium shadow-sm"
                            >
                                <FolderPlus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Folder</span>
                            </button>

                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsUploadMenuOpen(!isUploadMenuOpen); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-all text-xs font-semibold"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    New
                                </button>

                                {isUploadMenuOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[60] animate-in fade-in zoom-in-95 duration-200">
                                        <button
                                            onClick={() => { setIsCreateNoteModalOpen(true); setIsUploadMenuOpen(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3 border-b border-slate-50"
                                        >
                                            <FileText className="w-4 h-4 text-emerald-500" />
                                            New Text File
                                        </button>
                                        <button
                                            onClick={handleCreatePlannerClick}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3 border-b border-slate-50"
                                        >
                                            <Calendar className="w-4 h-4 text-indigo-500" />
                                            New Planner
                                        </button>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3 border-b border-slate-50"
                                        >
                                            <Upload className="w-4 h-4 text-blue-500" />
                                            Upload Files
                                        </button>
                                        <button
                                            onClick={triggerFolderUploadSelection}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3"
                                        >
                                            <FolderUp className="w-4 h-4 text-indigo-500" />
                                            Upload Folder
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
