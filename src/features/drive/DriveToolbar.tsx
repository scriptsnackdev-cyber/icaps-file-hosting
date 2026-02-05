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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative z-20">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm text-slate-500 overflow-x-auto my-2 sm:my-0">
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
                    className={`flex items-center gap-1 hover:text-blue-600 px-2 py-1 rounded-md transition-colors ${!slug || slug.length === 0 ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`}
                >
                    <HomeIcon className="w-4 h-4" />
                    <span>My Files</span>
                </button>
                {breadcrumbsToRender.map((f, i) => (
                    <React.Fragment key={f.id}>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
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
                            className={`hover:text-blue-600 px-2 py-1 rounded-md transition-colors whitespace-nowrap ${i === breadcrumbsToRender.length - 1 ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`}
                        >
                            {f.name}
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* Controls */}
            <div className="flex bg-slate-100 p-1 rounded-lg gap-1 relative">
                <button
                    onClick={handleShareClick}
                    disabled={!currentFolderId && selectedNodeIds.size !== 1}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 rounded-md shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Share2 className="w-4 h-4" />
                    Share
                </button>
                <button
                    onClick={handleMainDownload}
                    disabled={(!currentFolderId && selectedNodeIds.size === 0) || isDownloading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 rounded-md shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Download
                </button>

                {currentProject?.settings?.read_only && !isAdmin ? (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 text-amber-600 rounded-md border border-amber-200 text-xs font-bold uppercase tracking-wider">
                        <Lock className="w-3.5 h-3.5" />
                        Locked
                    </div>
                ) : (
                    <>
                        <button
                            onClick={handleCreateFolderClick}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 rounded-md shadow-sm border border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-medium"
                        >
                            <FolderPlus className="w-4 h-4" />
                            New Folder
                        </button>

                        {/* Upload Menu */}
                        <div className="relative">
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsUploadMenuOpen(!isUploadMenuOpen); }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 transition-all text-sm font-medium"
                            >
                                <Plus className="w-4 h-4" />
                                New
                            </button>

                            {/* Dropdown */}
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
    );
};
