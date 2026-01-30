import React from 'react';
import { StorageNode } from '@/types';
import { X, FileText, Folder, Calendar, HardDrive, User } from 'lucide-react';
import { format } from 'date-fns';

interface FileInfoPanelProps {
    node: StorageNode | null;
    isOpen: boolean;
    onClose: () => void;
}

export function FileInfoPanel({ node, isOpen, onClose }: FileInfoPanelProps) {
    if (!isOpen || !node) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl border-l border-slate-200 transform transition-transform duration-300 ease-in-out z-[60] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Details</span>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {/* Icon Preview */}
                <div className="flex justify-center mb-8">
                    <div className={`w-24 h-24 rounded-2xl flex items-center justify-center shadow-sm ${node.type === 'FOLDER' ? 'bg-indigo-50 text-indigo-500' : 'bg-blue-50 text-blue-500'}`}>
                        {node.type === 'FOLDER' ? (
                            <Folder className="w-12 h-12 fill-current" />
                        ) : (
                            <FileText className="w-12 h-12" />
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Name */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Name</label>
                        <p className="text-sm font-medium text-slate-800 break-words">{node.name}</p>
                    </div>

                    {/* Type */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Type</label>
                        <p className="text-sm text-slate-600 capitalize">{node.type.toLowerCase()}</p>
                    </div>

                    {/* Size */}
                    {node.type === 'FILE' && (
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Size</label>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <HardDrive className="w-4 h-4 text-slate-400" />
                                {node.size ? (node.size / 1024).toFixed(1) + ' KB' : '0 KB'}
                            </div>
                        </div>
                    )}

                    {/* Owner */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Owner</label>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                            <User className="w-4 h-4 text-slate-400" />
                            {node.owner_email || 'Unknown'}
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="space-y-3 pt-3 border-t border-slate-50">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Created</label>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                {format(new Date(node.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Modified</label>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                {format(new Date(node.updated_at), 'MMM d, yyyy h:mm a')}
                            </div>
                        </div>
                    </div>

                    {/* Metadata */}
                    {node.mime_type && (
                        <div className="pt-3 border-t border-slate-50">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">MIME Type</label>
                            <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200">{node.mime_type}</code>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
