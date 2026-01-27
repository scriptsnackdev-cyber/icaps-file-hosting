'use client';

import React from 'react';
import { FileText, Download, Trash2, Calendar, HardDrive, File as FileIcon, Folder, FolderOpen, ChevronRight } from 'lucide-react';
import { R2Object } from '@/types';

interface FileTableProps {
    files: R2Object[];
    loading: boolean;
    onDelete: (key: string) => void;
    onDownload: (key: string) => void;
    currentPath: string;
    onNavigate: (path: string) => void;
}

export const FileTable: React.FC<FileTableProps> = ({ files, loading, onDelete, onDownload, currentPath, onNavigate }) => {
    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        // Handle ISO string or other formats
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Directory Logic
    const getDisplayItems = () => {
        const folders = new Set<string>();
        const fileItems: R2Object[] = [];

        files.forEach(file => {
            // If file is not in current path, skip
            if (!file.key.startsWith(currentPath)) return;

            // Extract relative path
            const relativePath = file.key.slice(currentPath.length);

            // If relative path is empty, it's exactly the current path (maybe a placeholder object?), skip or handle
            if (!relativePath) return;

            const parts = relativePath.split('/');

            if (parts.length > 1) {
                // It's in a subfolder
                folders.add(parts[0]);
            } else {
                // It's a file in the current directory
                fileItems.push(file);
            }
        });

        return {
            folders: Array.from(folders).sort(),
            files: fileItems.sort((a, b) => a.key.localeCompare(b.key))
        };
    };

    const { folders, files: currentFiles } = getDisplayItems();
    const isEmpty = folders.length === 0 && currentFiles.length === 0;

    if (loading && files.length === 0) {
        return (
            <div className="p-16 text-center text-slate-500">
                <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-6 shadow-lg shadow-blue-200"></div>
                <p className="text-lg font-medium animate-pulse">Loading your files...</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl shadow-lg border border-slate-200 bg-white/90 backdrop-blur-md">
            {isEmpty ? (
                <div className="p-16 text-center">
                    <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-full mx-auto flex items-center justify-center mb-6">
                        <FolderOpen className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900">Empty Folder</h3>
                    <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                        No files or folders found in this directory.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                                <th className="px-6 py-5 text-sm font-semibold uppercase tracking-wider">Name</th>
                                <th className="px-6 py-5 text-sm font-semibold uppercase tracking-wider">Size</th>
                                <th className="px-6 py-5 text-sm font-semibold uppercase tracking-wider hidden sm:table-cell">Uploaded</th>
                                <th className="px-6 py-5 text-sm font-semibold uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* Folders */}
                            {folders.map((folderName) => (
                                <tr
                                    key={`folder-${folderName}`}
                                    className="hover:bg-blue-50/50 transition-colors group duration-200 cursor-pointer"
                                    onClick={() => onNavigate(currentPath + folderName + '/')}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-4">
                                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                                                <Folder className="w-5 h-5 fill-current" />
                                            </div>
                                            <span className="text-sm font-medium text-slate-900 truncate max-w-[150px] sm:max-w-xs group-hover:text-indigo-700 transition-colors">
                                                {folderName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-400">-</td>
                                    <td className="px-6 py-4 text-sm text-slate-400 hidden sm:table-cell">-</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="p-2 text-slate-400">
                                            <ChevronRight className="w-5 h-5 ml-auto" />
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {/* Files */}
                            {currentFiles.map((file) => (
                                <tr key={file.key} className="hover:bg-blue-50/50 transition-colors group duration-200">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-4">
                                            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <span className="text-sm font-medium text-slate-900 truncate max-w-[150px] sm:max-w-xs group-hover:text-blue-700 transition-colors" title={file.key}>
                                                {file.key.split('/').pop()}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center text-sm text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full w-fit">
                                            <HardDrive className="w-3.5 h-3.5 mr-1.5 opacity-60" />
                                            {formatSize(file.size)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                        <div className="flex items-center text-sm text-slate-500">
                                            <Calendar className="w-4 h-4 mr-2 opacity-50" />
                                            {formatDate(file.uploaded)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDownload(file.key); }}
                                                className="p-2 text-blue-600 hover:bg-blue-100/80 rounded-lg transition-all shadow-sm hover:shadow-md border border-transparent hover:border-blue-200"
                                                title="Download"
                                            >
                                                <Download className="w-4.5 h-4.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDelete(file.key); }}
                                                className="p-2 text-red-600 hover:bg-red-100/80 rounded-lg transition-all shadow-sm hover:shadow-md border border-transparent hover:border-red-200"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4.5 h-4.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
