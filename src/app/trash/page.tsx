'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Trash2, RotateCcw, AlertCircle, FileText, Folder, Check, X, Loader2 } from 'lucide-react';
import { StorageNode } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { format } from 'date-fns';

export default function TrashPage() {
    const { showToast } = useToast();
    const [trashNodes, setTrashNodes] = useState<(StorageNode & { projects?: { name: string } })[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => Promise<void>;
        isDeleting: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: async () => { },
        isDeleting: false
    });

    const fetchTrash = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/drive?view=trash');
            if (res.ok) {
                const data = await res.json();
                setTrashNodes(data.nodes || []);
            } else {
                console.error("Failed to load trash");
            }
        } catch (e) {
            console.error("Error fetching trash", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTrash();
    }, []);

    const handleRestore = async (id: string) => {
        try {
            const res = await fetch('/api/drive', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: 'ACTIVE' })
            });
            if (res.ok) {
                showToast("Item restored", "success");
                setTrashNodes(prev => prev.filter(n => n.id !== id));
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            } else {
                showToast("Failed to restore item", "error");
            }
        } catch (e) {
            showToast("Error restoring item", "error");
        }
    };

    const handleDeleteForever = (id: string) => {
        setDeleteModal({
            isOpen: true,
            title: 'Delete Permanently',
            message: 'Are you sure you want to permanently delete this item? This action cannot be undone.',
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/drive?id=${id}&permanent=true`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast("Item deleted permanently", "success");
                        setTrashNodes(prev => prev.filter(n => n.id !== id));
                        setSelectedIds(prev => {
                            const next = new Set(prev);
                            next.delete(id);
                            return next;
                        });
                    } else {
                        showToast("Failed to delete item", "error");
                    }
                } catch (e) {
                    showToast("Error deleting item", "error");
                } finally {
                    setDeleteModal(prev => ({ ...prev, isOpen: false }));
                }
            },
            isDeleting: false
        });
    };

    const handleEmptyTrash = () => {
        if (trashNodes.length === 0) return;
        setDeleteModal({
            isOpen: true,
            title: 'Empty Trash',
            message: `Are you sure you want to permanently delete all ${trashNodes.length} items? This cannot be undone.`,
            onConfirm: async () => {
                let successCount = 0;
                setLoading(true);

                // Naive implementation
                const chunk = 5;
                for (let i = 0; i < trashNodes.length; i += chunk) {
                    const batch = trashNodes.slice(i, i + chunk);
                    await Promise.all(batch.map(async (node) => {
                        try {
                            const res = await fetch(`/api/drive?id=${node.id}&permanent=true`, { method: 'DELETE' });
                            if (res.ok) successCount++;
                        } catch (e) { console.error(e) }
                    }));
                }

                showToast(`Permanently deleted ${successCount} items`, "success");
                fetchTrash();
                setDeleteModal(prev => ({ ...prev, isOpen: false }));
            },
            isDeleting: false
        });
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkRestore = async () => {
        if (selectedIds.size === 0) return;
        setLoading(true);
        let success = 0;
        for (const id of Array.from(selectedIds)) {
            try {
                const res = await fetch('/api/drive', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, status: 'ACTIVE' })
                });
                if (res.ok) success++;
            } catch (e) { }
        }
        showToast(`Restored ${success} items`, "success");
        setSelectedIds(new Set());
        fetchTrash();
    };

    return (
        <div className="flex h-screen bg-slate-50">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden ml-64">

                {/* Header */}
                <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                            <Trash2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Trash</h1>
                            <p className="text-sm text-slate-500">Items are moved here before permanent deletion.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleBulkRestore}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Restore Selected ({selectedIds.size})
                            </button>
                        )}
                        <button
                            onClick={handleEmptyTrash}
                            disabled={trashNodes.length === 0}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Trash2 className="w-4 h-4" />
                            Empty Trash
                        </button>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-auto p-8">
                    {loading && trashNodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
                            <p className="text-slate-500">Loading trash...</p>
                        </div>
                    ) : trashNodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                                <Trash2 className="w-10 h-10 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-semibold text-slate-900">Trash is Empty</h3>
                            <p className="text-slate-500 mt-2">Any deleted items will appear here.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold">
                                    <tr>
                                        <th className="w-10 px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === trashNodes.length && trashNodes.length > 0}
                                                onChange={() => {
                                                    if (selectedIds.size === trashNodes.length) setSelectedIds(new Set());
                                                    else setSelectedIds(new Set(trashNodes.map(n => n.id)));
                                                }}
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </th>
                                        <th className="px-6 py-3">Name</th>
                                        <th className="px-6 py-3">Date Deleted</th>
                                        <th className="px-6 py-3">Original Project</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {trashNodes.map((node) => (
                                        <tr key={node.id} className="hover:bg-slate-50 group transition-colors">
                                            <td className="px-4 py-4 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(node.id)}
                                                    onChange={() => toggleSelect(node.id)}
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${node.type === 'FOLDER' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                                                        {node.type === 'FOLDER' ? <Folder className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                                    </div>
                                                    <span className="font-medium text-slate-700">{node.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500">
                                                {node.trashed_at ? format(new Date(node.trashed_at), 'MMM d, yyyy HH:mm') : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500">
                                                {node.projects?.name || 'Unknown Project'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleRestore(node.id)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md tooltip"
                                                        title="Restore"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteForever(node.id)}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                                                        title="Delete Forever"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </main>
            </div>

            {/* Delete Confirmation Modal */}
            {
                deleteModal.isOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 z-[110] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 bg-red-50 text-red-600 rounded-full">
                                    <AlertCircle className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">{deleteModal.title}</h3>
                            </div>

                            <p className="text-slate-600 mb-8 leading-relaxed">
                                {deleteModal.message}
                            </p>

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                                    className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setDeleteModal(prev => ({ ...prev, isDeleting: true }));
                                        deleteModal.onConfirm();
                                    }}
                                    disabled={deleteModal.isDeleting}
                                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-200 transition-all transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {deleteModal.isDeleting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            Delete Forever
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
