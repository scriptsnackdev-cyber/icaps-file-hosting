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
    return (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 bg-white p-2 px-4 rounded-full border border-slate-200 shadow-sm relative z-20">
            {/* Breadcrumbs */}
            <div className="flex-1 flex items-center gap-1 text-xs text-slate-500 overflow-x-hidden min-w-0">
                <button
                    onClick={() => navigateUp(-1)}
                    onDragOver={(e) => {
                        if (draggedNode && draggedNode.parent_id !== null) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                        }
                    }}
                    onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggedNode && draggedNode.parent_id !== null) {
                            if (selectedNodeIds.has(draggedNode.id)) {
                                const itemsToMove = nodes.filter(n => selectedNodeIds.has(n.id));
                                for (const item of itemsToMove) {
                                    if (item.parent_id !== null) {
                                        await handleMoveNode(item, null);
                                    }
                                }
                            } else {
                                await handleMoveNode(draggedNode, null);
                            }
                            setDraggedNode(null);
                            setSelectedNodeIds(new Set());
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
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'move';
                                }
                            }}
                            onDrop={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (draggedNode && draggedNode.id !== f.id && draggedNode.parent_id !== f.id) {
                                    if (selectedNodeIds.has(draggedNode.id)) {
                                        const itemsToMove = nodes.filter(n => selectedNodeIds.has(n.id));
                                        for (const item of itemsToMove) {
                                            if (item.id !== f.id && item.parent_id !== f.id) {
                                                await handleMoveNode(item, f.id);
                                            }
                                        }
                                    } else {
                                        await handleMoveNode(draggedNode, f.id);
                                    }
                                    setDraggedNode(null);
                                    setSelectedNodeIds(new Set());
                                }
                            }}
                            className={`hover:text-blue-600 px-2 py-1 rounded-full transition-colors whitespace-nowrap min-w-0 flex items-center ${i === breadcrumbsToRender.length - 1 ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`}
                        >
                            <span className="max-w-[80px] sm:max-w-[150px] truncate">{f.name}</span>
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* Controls & Quota */}
            <div className="flex items-center gap-4 shrink-0">
                {/* Compact Quota Bar */}
                {currentProject && (
                    <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 border-r border-slate-100 pr-4">
                        <span>Quota:</span>
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all ${(currentProject.current_storage_bytes / currentProject.max_storage_bytes) > 0.9 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(100, (currentProject.current_storage_bytes / currentProject.max_storage_bytes) * 100)}%` }}
                            />
                        </div>
                        <span className="font-medium text-slate-600">
                            {(currentProject.current_storage_bytes / (1024 * 1024)).toFixed(1)}MB / {(currentProject.max_storage_bytes / (1024 * 1024)).toFixed(0)}MB
                        </span>
                    </div>
                )}

                <div className="flex bg-slate-50 p-1 rounded-full gap-1 items-center">
                    <button
                        onClick={handleShareClick}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-white text-slate-700 rounded-full shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Share2 className="w-3.5 h-3.5" />
                        Share
                    </button>
                    <button
                        onClick={handleMainDownload}
                        disabled={(!currentFolderId && selectedNodeIds.size === 0) || isDownloading}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-white text-slate-600 rounded-full shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Download
                    </button>

                    {currentProject?.settings?.read_only && !isAdmin ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-full border border-amber-200 text-[10px] font-bold uppercase tracking-wider">
                            <Lock className="w-3 h-3" />
                            Locked
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={handleCreateFolderClick}
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-white text-slate-600 rounded-full shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-[11px] font-medium"
                            >
                                <FolderPlus className="w-3.5 h-3.5" />
                                Folder
                            </button>

                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsUploadMenuOpen(!isUploadMenuOpen); }}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white rounded-full shadow-sm hover:bg-blue-700 transition-all text-[11px] font-medium"
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
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3"
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
