'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Loader2, FileText, Download, Folder, AlertCircle, Cloud, FileArchive, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { StorageNode } from '@/types';

export default function SharePage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [node, setNode] = useState<StorageNode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPasswordRequired, setIsPasswordRequired] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null);
    const [downloadingZip, setDownloadingZip] = useState(false);
    const [isRedirecting, setIsRedirecting] = useState(false);
    const [status, setStatus] = useState<number | null>(null);

    const fetchNode = async (pwd?: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/drive/public-node', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Ensure cookies are sent for session check
                body: JSON.stringify({ id, password: pwd })
            });

            const data = await res.json();
            setStatus(res.status);

            if (res.status === 403) {
                if (data.passwordObject) {
                    if (pwd) {
                        setError('Incorrect password. Please try again.');
                    }
                    setIsPasswordRequired(true);
                    setLoading(false);
                    return;
                }
            }

            if (!res.ok) {
                // Don't throw for 401/403 as we handle them via status state in UI
                if (res.status === 401 || res.status === 403) {
                    setError(data.error || 'Access denied');
                    setLoading(false);
                    return;
                }
                throw new Error(data.error || 'Failed to load');
            }

            if (data.isMember && data.projectUUID) {
                setIsRedirecting(true);
                const drivePath = `/drive/${data.projectUUID}${data.folderPath ? '/' + data.folderPath : ''}`;
                router.push(drivePath);
                return; // Stop processing
            }

            setNode(data);
            if (pwd) setVerifiedPassword(pwd);
            setIsPasswordRequired(false);

        } catch (e: any) {
            console.error(e);
            if (pwd !== undefined && e.message === 'Incorrect password') {
                setError('Incorrect password. Please try again.');
            } else {
                setError(e.message || 'File not found or access denied.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNode();
    }, [id]);

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchNode(passwordInput);
    };

    const handleDownloadZip = async () => {
        if (!node) return;
        setDownloadingZip(true);
        try {
            // Append password if verified
            let url = `/api/drive/zip?folderId=${node.id}`;
            if (verifiedPassword) url += `&pwd=${encodeURIComponent(verifiedPassword)}`;
            window.location.href = url;
        } catch (e) {
            alert('Failed to start download');
        } finally {
            setTimeout(() => setDownloadingZip(false), 2000);
        }
    };

    const handleFileDownload = () => {
        if (!node || !node.r2_key) return;
        let url = `/api/files/${encodeURIComponent(node.r2_key)}`;
        if (verifiedPassword) url += `?pwd=${encodeURIComponent(verifiedPassword)}`;
        window.open(url, '_blank');
    };

    if (loading || isRedirecting) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                    {isRedirecting && <p className="text-slate-500 text-sm animate-pulse">Redirecting to project drive...</p>}
                </div>
            </div>
        )
    }

    if (isPasswordRequired) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                    <div className="p-8">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Lock className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900">Password Required</h2>
                            <p className="text-slate-500 mt-2">This link is protected with a password.</p>
                        </div>

                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter password..."
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5" />
                                    ) : (
                                        <Eye className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                            >
                                <span>Access Content</span>
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        </form>
                        {error && (
                            <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center">
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (error || !node) {
        const isUnauthorized = status === 401;

        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-md w-full">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">
                        {isUnauthorized ? 'Authentication Required' : 'Access Denied'}
                    </h2>
                    <p className="text-slate-500 mb-6 font-medium">
                        {error || "This link may be broken or expired."}
                    </p>

                    <div className="flex flex-col gap-2">
                        {isUnauthorized ? (
                            <button
                                onClick={() => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                Log In to Access
                            </button>
                        ) : (
                            <button
                                onClick={() => router.push('/')}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-all"
                            >
                                Back to Home
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="mb-8 text-center flex flex-col items-center">
                <div className="w-32 h-32 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100 p-2">
                    <img src="/ICAPS.png" alt="ICAPS Logo" className="w-full h-full object-contain" />
                </div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Shared Item</h1>
                <p className="text-slate-500 font-medium">You have been given access to this content</p>
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

                    {/* Determine permissions - View is implied if we got here */}
                    <div className="flex flex-col w-full gap-3">
                        {node.type === 'FILE' ? (
                            <button
                                onClick={handleFileDownload}
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

                    <div className="mt-6 pt-6 border-t border-slate-100 w-full text-center">
                        <p className="text-xs text-slate-400">Shared via ICAPS CLOUD</p>
                    </div>
                </div>
            </div>
            <div className="mt-12 text-center">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">
                    © 2026 ICAPS Clouds Software
                </p>
                <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                    Powered by <span className="text-blue-500 font-bold">Script Snack Dev</span>
                </p>
            </div>
        </div>
    );
}
