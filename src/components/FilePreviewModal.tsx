'use client';

import React, { useState, useEffect } from 'react';
import { X, ExternalLink, DownloadCloud, FileText, Image as ImageIcon, Video, Music } from 'lucide-react';
import { getPreviewUrl } from '@/app/actions';
import type { DriveNode } from '@/lib/supabase';

export default function FilePreviewModal({
    node,
    onClose,
    onDownload
}: {
    node: DriveNode;
    onClose: () => void;
    onDownload: () => void;
}) {
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!node.r2_key) return;
        getPreviewUrl(node.r2_key, node.mime_type || 'application/octet-stream').then(url => {
            setPreviewUrl(url);
            setLoading(false);
        }).catch(err => {
            console.error('Failed to get preview URL', err);
            setLoading(false);
        });
    }, [node]);

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const isImage = node.mime_type?.startsWith('image/');
    const isVideo = node.mime_type?.startsWith('video/');
    const isAudio = node.mime_type?.startsWith('audio/');
    const isPdf = node.mime_type === 'application/pdf';
    const isText = node.mime_type?.startsWith('text/');

    const canPreview = isImage || isVideo || isAudio || isPdf;

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(10px)',
                zIndex: 99999,
                display: 'flex', flexDirection: 'column',
                animation: 'fadeIn 0.2s ease',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Header */}
            <div style={{
                padding: '24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
                color: 'white',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                    {isImage && <ImageIcon size={20} />}
                    {isVideo && <Video size={20} />}
                    {isAudio && <Music size={20} />}
                    {(!isImage && !isVideo && !isAudio) && <FileText size={20} />}
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{node.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                    <button
                        onClick={onDownload}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
                            padding: '8px 16px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                            fontSize: '0.9rem', fontWeight: 600,
                            backdropFilter: 'blur(4px)',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                    >
                        <DownloadCloud size={16} /> Download
                    </button>
                    {(canPreview || isText) && previewUrl && (
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white',
                                padding: '8px 16px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                                fontSize: '0.9rem', fontWeight: 600,
                                textDecoration: 'none',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <ExternalLink size={16} /> Open in new tab
                        </a>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'rgba(0,0,0,0.3)', border: 'none',
                            color: 'white', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(4px)',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.3)')}
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 40px 40px' }}
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            >
                {loading ? (
                    <div style={{ color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)',
                            borderTopColor: 'white', animation: 'spin 1s linear infinite'
                        }} />
                        <div style={{ fontSize: '1.1rem', fontWeight: 500, letterSpacing: '0.05em' }}>Loading preview...</div>
                    </div>
                ) : !canPreview ? (
                    <div style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        padding: '40px 60px', borderRadius: 'var(--r-xl)', textAlign: 'center', color: 'white',
                        backdropFilter: 'blur(8px)',
                    }}>
                        <FileText size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                        <h3 style={{ fontSize: '1.4rem', margin: '0 0 8px' }}>No preview available</h3>
                        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 24px' }}>This file type cannot be previewed directly in the browser.</p>
                        <button
                            onClick={onDownload}
                            style={{
                                background: 'white', color: 'black', border: 'none',
                                padding: '12px 24px', borderRadius: 'var(--r-full)', fontSize: '1rem', fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer'
                            }}
                        >
                            <DownloadCloud size={18} /> Download to view
                        </button>
                    </div>
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isImage && (
                            <img
                                src={previewUrl}
                                alt={node.name}
                                style={{
                                    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                                    borderRadius: '8px', boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
                                    animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                                }}
                            />
                        )}
                        {isVideo && (
                            <video
                                src={previewUrl}
                                controls
                                autoPlay
                                style={{
                                    maxWidth: '100%', maxHeight: '100%',
                                    borderRadius: '8px', boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
                                    animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                                }}
                            />
                        )}
                        {isAudio && (
                            <div style={{
                                background: 'rgba(255,255,255,0.1)', padding: '40px', borderRadius: 'var(--r-xl)',
                                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
                                animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}>
                                <Music size={48} color="white" style={{ opacity: 0.8 }} />
                                <div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 600 }}>{node.name}</div>
                                <audio src={previewUrl} controls autoPlay style={{ width: 400, maxWidth: '100%' }} />
                            </div>
                        )}
                        {isPdf && (
                            <iframe
                                src={previewUrl}
                                style={{
                                    width: '100%', height: '100%', border: 'none', borderRadius: '8px',
                                    background: 'white', boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
                                    animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                                }}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
