'use client';

import React from 'react';
import { X, Pencil, Download, Loader2, FileText } from 'lucide-react';
import { StorageNode } from '@/types';

interface DrivePreviewModalProps {
    previewNode: StorageNode | null;
    previewContent: string | null;
    loadingPreview: boolean;
    isAdmin: boolean;
    userEmail: string | null;
    closePreview: () => void;
    setEditingNode: (node: StorageNode | null) => void;
    setEditInitialContent: (content: string) => void;
    setIsCreateNoteModalOpen: (open: boolean) => void;
}

export const DrivePreviewModal: React.FC<DrivePreviewModalProps> = ({
    previewNode,
    previewContent,
    loadingPreview,
    isAdmin,
    userEmail,
    closePreview,
    setEditingNode,
    setEditInitialContent,
    setIsCreateNoteModalOpen
}) => {
    if (!previewNode) return null;

    return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm" onClick={closePreview}>
            <button onClick={closePreview} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50">
                <X className="w-6 h-6" />
            </button>

            <div className="w-full h-full max-w-6xl max-h-[90vh] p-4 flex flex-col justify-center items-center" onClick={e => e.stopPropagation()}>

                <div className="w-full flex justify-between items-center mb-4 px-4">
                    <h3 className="text-white font-medium text-lg truncate max-w-xl">{previewNode.name}</h3>
                    <div className="flex items-center gap-3">
                        {['txt', 'md', 'json', 'js', 'ts', 'tsx', 'css', 'html', 'py', 'java', 'c', 'cpp'].includes(previewNode.name.split('.').pop()?.toLowerCase() || '') && (isAdmin || previewNode.owner_email === userEmail) && (
                            <button
                                onClick={() => {
                                    setEditingNode(previewNode);
                                    setEditInitialContent(previewContent || "");
                                    closePreview();
                                    setIsCreateNoteModalOpen(true);
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit
                            </button>
                        )}
                        <button
                            onClick={() => window.open(`/api/files/${encodeURIComponent(previewNode.r2_key!)}?filename=${encodeURIComponent(previewNode.name)}`)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Download
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center border border-slate-700">
                    {(() => {
                        const ext = previewNode.name.split('.').pop()?.toLowerCase() || '';
                        const url = `/api/files/${encodeURIComponent(previewNode.r2_key!)}?filename=${encodeURIComponent(previewNode.name)}`;

                        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
                            return (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={url} alt={previewNode.name} className="max-w-full max-h-full object-contain" />
                            );
                        } else if (['mp4', 'webm', 'mov'].includes(ext)) {
                            return (
                                <video src={url} controls className="max-w-full max-h-full" />
                            );
                        } else if (ext === 'pdf') {
                            return (
                                <iframe src={url} className="w-full h-full" title="PDF Preview" />
                            );
                        } else if (['txt', 'md', 'json', 'js', 'ts', 'tsx', 'css', 'html', 'py', 'java', 'c', 'cpp', 'csv', 'xml', 'yml', 'yaml'].includes(ext)) {
                            return loadingPreview ? (
                                <div className="flex flex-col items-center gap-3 text-slate-400">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                    <span>Loading content...</span>
                                </div>
                            ) : (
                                <div className="w-full h-full overflow-auto p-6 bg-[#1e1e1e] text-slate-300 font-mono text-sm custom-scrollbar">
                                    <pre className="whitespace-pre-wrap break-words">{previewContent}</pre>
                                </div>
                            );
                        } else {
                            return (
                                <div className="text-center text-slate-400">
                                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    <p className="text-lg font-medium">Preview not available</p>
                                    <p className="text-sm mt-2">Download the file to view its content</p>
                                </div>
                            );
                        }
                    })()}
                </div>
            </div>
        </div>
    );
};
