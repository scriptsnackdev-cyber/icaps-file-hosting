'use client';

import React from 'react';
import { useTransfer } from '@/context/TransferContext';
import { X, ChevronUp, ChevronDown, Package, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function GlobalTransferUI() {
    const { transfers, showTransfers, setShowTransfers } = useTransfer();

    if (transfers.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '320px',
            backgroundColor: 'var(--bg-card)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-soft)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
            {/* Header */}
            <div 
                onClick={() => setShowTransfers(!showTransfers)}
                style={{
                    padding: '12px 16px',
                    backgroundColor: 'var(--bg-elevated)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderBottom: showTransfers ? '1px solid var(--border-soft)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                        width: '24px', 
                        height: '24px', 
                        borderRadius: '6px', 
                        backgroundColor: 'var(--brand-primary)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                    }}>
                        <Package size={14} color="white" />
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Transfers ({transfers.filter(t => t.status === 'running').length})
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {showTransfers ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronUp size={18} color="var(--text-muted)" />}
                </div>
            </div>

            {/* List */}
            {showTransfers && (
                <div style={{ maxHeight: '350px', overflowY: 'auto', backgroundColor: 'var(--bg-card)' }}>
                    {transfers.map(task => (
                        <div key={task.id} style={{ 
                            padding: '12px 16px', 
                            borderBottom: '1px solid var(--border-soft)',
                            animation: 'fadeIn 0.2s ease-out'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ 
                                    fontSize: '0.825rem', 
                                    whiteSpace: 'nowrap', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    color: 'var(--text-primary)', 
                                    fontWeight: 600,
                                    flex: 1
                                }}>
                                    {task.name}
                                </div>
                                {task.totalFiles !== undefined && (
                                    <div style={{ 
                                        fontSize: '0.65rem', 
                                        color: 'var(--text-muted)', 
                                        fontWeight: 700, 
                                        marginLeft: '8px',
                                        background: 'var(--bg-elevated)',
                                        padding: '2px 6px',
                                        borderRadius: '4px'
                                    }}>
                                        {task.filesDone}/{task.totalFiles} Files
                                    </div>
                                )}
                            </div>
                            
                            {task.status === 'running' && (
                                <>
                                    <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden', marginBottom: '6px' }}>
                                        <div style={{ 
                                            height: '100%', 
                                            background: 'linear-gradient(90deg, var(--brand-start), var(--brand-end))', 
                                            width: `${Math.max(3, task.progress)}%`, 
                                            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
                                        }} />
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Loader2 size={10} className="animate-spin" />
                                            {task.type === 'upload' ? 'Uploading...' : 'Downloading...'}
                                        </span>
                                        <span>{task.progress}%</span>
                                    </div>
                                </>
                            )}
                            
                            {task.status === 'completed' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={14} color="var(--success-text)" />
                                    <div style={{ fontSize: '0.78rem', color: 'var(--success-text)', fontWeight: 600 }}>Completed</div>
                                </div>
                            )}
                            
                            {task.status === 'error' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertCircle size={14} color="var(--error-text)" />
                                    <div style={{ fontSize: '0.78rem', color: 'var(--error-text)', fontWeight: 600 }}>Failed</div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
