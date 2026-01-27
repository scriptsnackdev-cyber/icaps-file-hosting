'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, FileText, Download, Folder, AlertCircle, Cloud, FileArchive } from 'lucide-react';
import { StorageNode } from '@/types';

export default function SharePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const id = params.id as string;
    const scope = searchParams.get('scope') || 'PRIVATE';
    const permission = searchParams.get('perm') || 'VIEW';

    const [node, setNode] = useState<StorageNode | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloadingZip, setDownloadingZip] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        const fetchNode = async () => {
            const { data, error } = await supabase
                .from('storage_nodes')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error(error);
                setError('File not found or access denied.');
            } else {
                setNode(data as StorageNode);
            }
            setLoading(false);
        };
        fetchNode();
    }, [id, supabase]);

    const handleDownloadZip = async () => {
        if (!node) return;
        setDownloadingZip(true);
        try {
            // Trigger download via window.location or fetch
            // Using window.location to trigger native browser download behavior
            window.location.href = `/api/drive/zip?folderId=${node.id}`;
        } catch (e) {
            alert('Failed to start download');
        } finally {
            // Reset loading state after a short delay, as we can't track native download progress easily
            setTimeout(() => setDownloadingZip(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    if (error || !node) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-md">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
                    <p className="text-slate-500">{error || "This link may be broken or expired."}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="mb-8 text-center">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-blue-200">
                    <Cloud className="w-7 h-7" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">Shared Item</h1>
                <p className="text-slate-500">You have been given access to this content</p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
                <div className="p-8 flex flex-col items-center">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                        {node.type === 'FOLDER' ? (
                            <Folder className="w-10 h-10 fill-current" />
                        ) : (
                            <FileText className="w-10 h-10" />
                        )}
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 mb-2 text-center break-all">{node.name}</h2>

                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-8">
                        {node.type === 'FILE' && <span>{(node.size! / 1024).toFixed(1)} KB</span>}
                        {node.type === 'FOLDER' && <span>Folder Archive</span>}
                        <span>•</span>
                        <span>{new Date(node.updated_at).toLocaleDateString()}</span>
                    </div>

                    {permission === 'VIEW' && (
                        <div className="flex flex-col w-full gap-3">
                            {node.type === 'FILE' ? (
                                <button
                                    onClick={() => window.open(`/api/files/${encodeURIComponent(node.r2_key!)}`)}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200"
                                >
                                    <Download className="w-5 h-5" />
                                    Download File
                                </button>
                            ) : (
                                <button
                                    onClick={handleDownloadZip}
                                    disabled={downloadingZip}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 disabled:opacity-75"
                                >
                                    {downloadingZip ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <FileArchive className="w-5 h-5" />
                                    )}
                                    {downloadingZip ? 'Zipping...' : 'Download Folder as ZIP'}
                                </button>
                            )}
                        </div>
                    )}

                    {permission === 'EDIT' && (
                        <div className="w-full bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm text-center mb-4">
                            You have <strong>Edit</strong> access to this item.
                        </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-slate-100 w-full text-center">
                        <p className="text-xs text-slate-400">Shared via CloudPoint</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
