'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, UploadCloud, DownloadCloud, Trash2, Edit2, MoveRight, Share2, FolderPlus, ExternalLink, RefreshCw, Activity } from 'lucide-react';
import { fetchProjectLogs } from '@/app/actions';
import type { ActivityLog } from '@/app/actions';

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
    upload: { label: 'Uploaded', icon: <UploadCloud size={14} />, color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
    download: { label: 'Downloaded', icon: <DownloadCloud size={14} />, color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    delete: { label: 'Deleted', icon: <Trash2 size={14} />, color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
    rename: { label: 'Renamed', icon: <Edit2 size={14} />, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    move: { label: 'Moved', icon: <MoveRight size={14} />, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    share_create: { label: 'Shared', icon: <Share2 size={14} />, color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
    share_download: { label: 'External Download', icon: <ExternalLink size={14} />, color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
    folder_create: { label: 'Created Folder', icon: <FolderPlus size={14} />, color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
};

function getActionMeta(action: string) {
    return ACTION_META[action] ?? { label: action, icon: <Activity size={14} />, color: 'var(--text-secondary)', bg: 'var(--bg-overlay)' };
}

function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

function formatAbsoluteTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
}

function LogDetail({ log }: { log: ActivityLog }) {
    const meta = log.metadata;
    if (!meta) return null;
    if (log.action === 'rename') {
        return (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{String(meta.old_name)}</span>
                {' → '}
                <span style={{ color: 'var(--text-primary)' }}>{String(meta.new_name)}</span>
            </span>
        );
    }
    if (log.action === 'move') {
        return (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                → <span style={{ color: 'var(--text-secondary)' }}>{String(meta.destination)}</span>
            </span>
        );
    }
    if (log.action === 'upload' && meta.size) {
        const bytes = Number(meta.size);
        const size = bytes < 1024 * 1024
            ? `${(bytes / 1024).toFixed(1)} KB`
            : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>{size}</span>;
    }
    return null;
}

function getInitials(email: string) {
    return email.substring(0, 2).toUpperCase();
}

export default function ActivityLogModal({
    projectId,
    onClose,
}: {
    projectId: string;
    onClose: () => void;
}) {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    const load = useCallback(async () => {
        setLoading(true);
        const data = await fetchProjectLogs(projectId);
        setLogs(data);
        setLoading(false);
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const actionTypes = ['all', ...Object.keys(ACTION_META)];
    const filtered = filter === 'all' ? logs : logs.filter(l => l.action === filter);

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(6px)',
                zIndex: 99999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                animation: 'fadeIn 0.2s ease',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
                borderRadius: 'var(--r-lg)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                width: '680px',
                maxWidth: '100%',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid var(--border-soft)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 'var(--r-md)',
                            background: 'rgba(139,92,246,0.15)',
                            border: '1px solid rgba(139,92,246,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Activity size={16} color="var(--brand-end)" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Activity Log</div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{logs.length} events</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={load}
                            disabled={loading}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 'var(--r-md)',
                                border: '1px solid var(--border-soft)',
                                background: 'var(--bg-overlay)', color: 'var(--text-secondary)',
                                fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                                opacity: loading ? 0.5 : 1,
                                transition: 'all 0.15s',
                            }}
                        >
                            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                            Refresh
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                width: 32, height: 32, borderRadius: 'var(--r-md)',
                                background: 'var(--bg-overlay)', border: '1px solid var(--border-soft)',
                                color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Filter chips */}
                <div style={{
                    padding: '10px 24px',
                    borderBottom: '1px solid var(--border-soft)',
                    display: 'flex', gap: 6, flexWrap: 'wrap',
                    flexShrink: 0,
                }}>
                    {actionTypes.map(type => {
                        const m = type === 'all' ? null : ACTION_META[type];
                        const active = filter === type;
                        return (
                            <button
                                key={type}
                                onClick={() => setFilter(type)}
                                style={{
                                    padding: '4px 10px', borderRadius: 'var(--r-full)',
                                    border: active ? `1px solid ${m?.color ?? 'var(--brand-end)'}` : '1px solid var(--border-soft)',
                                    background: active ? (m?.bg ?? 'rgba(139,92,246,0.12)') : 'transparent',
                                    color: active ? (m?.color ?? 'var(--brand-end)') : 'var(--text-muted)',
                                    fontSize: '0.73rem', fontWeight: active ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    textTransform: 'capitalize',
                                }}
                            >
                                {m && <span style={{ opacity: 0.8 }}>{m.icon}</span>}
                                {type === 'all' ? 'All' : m?.label ?? type}
                            </button>
                        );
                    })}
                </div>

                {/* Log list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                    {loading ? (
                        <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                            <div>Loading activity...</div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Activity size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                            <div style={{ fontSize: '0.9rem' }}>No activity yet</div>
                        </div>
                    ) : (
                        filtered.map((log, idx) => {
                            const m = getActionMeta(log.action);
                            const isLast = idx === filtered.length - 1;
                            return (
                                <div
                                    key={log.id}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 14,
                                        padding: '12px 24px',
                                        borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {/* Avatar */}
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        background: 'linear-gradient(135deg, var(--brand-start), var(--brand-end))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontSize: '0.65rem', fontWeight: 700,
                                    }}>
                                        {getInitials(log.user_email)}
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {log.user_email}
                                            </span>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '2px 7px', borderRadius: 'var(--r-full)',
                                                background: m.bg, color: m.color,
                                                fontSize: '0.72rem', fontWeight: 700,
                                            }}>
                                                {m.icon} {m.label}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', marginTop: 3, flexWrap: 'wrap', gap: 4 }}>
                                            <span style={{
                                                fontSize: '0.83rem', color: 'var(--text-secondary)',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                maxWidth: '320px',
                                            }}>
                                                {log.node_name}
                                            </span>
                                            <LogDetail log={log} />
                                        </div>
                                    </div>

                                    {/* Time */}
                                    <div
                                        title={formatAbsoluteTime(log.created_at)}
                                        style={{ fontSize: '0.73rem', color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}
                                    >
                                        {formatRelativeTime(log.created_at)}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
