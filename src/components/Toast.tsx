'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
    showConfirm: (message: string, onConfirm: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const toastConfig = {
    success: { bg: 'var(--success-bg)', text: 'var(--success-text)', border: 'var(--success-border)' },
    error: { bg: 'var(--error-bg)', text: 'var(--error-text)', border: 'var(--error-border)' },
    info: { bg: 'var(--info-bg)', text: 'var(--info-text)', border: 'var(--info-border)' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

    const showToast = (message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3500);
    };

    const showConfirm = (message: string, onConfirm: () => void) => {
        setConfirmDialog({ message, onConfirm });
    };

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast, showConfirm }}>
            {children}

            {/* ── Toasts ── */}
            <div style={{
                position: 'fixed',
                bottom: '28px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 99999,
                alignItems: 'center',
                pointerEvents: 'none',
            }}>
                {toasts.map((toast) => {
                    const cfg = toastConfig[toast.type];
                    return (
                        <div key={toast.id} style={{
                            background: cfg.bg,
                            color: cfg.text,
                            border: `1px solid ${cfg.border}`,
                            padding: '11px 18px',
                            borderRadius: '10px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            pointerEvents: 'auto',
                            backdropFilter: 'blur(12px)',
                            animation: 'toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
                            minWidth: '220px',
                            maxWidth: '420px',
                        }}>
                            {toast.type === 'success' && <CheckCircle size={16} strokeWidth={2.5} />}
                            {toast.type === 'error' && <AlertTriangle size={16} strokeWidth={2.5} />}
                            {toast.type === 'info' && <Info size={16} strokeWidth={2.5} />}
                            <span style={{ fontWeight: 500, fontSize: '0.875rem', flex: 1 }}>{toast.message}</span>
                            <button
                                onClick={() => removeToast(toast.id)}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', opacity: 0.6, pointerEvents: 'auto' }}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* ── Confirm Dialog ── */}
            {confirmDialog && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 100000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px',
                }}>
                    <div style={{
                        background: 'var(--bg-surface)',
                        padding: '28px',
                        borderRadius: '16px',
                        width: '400px',
                        maxWidth: '100%',
                        border: '1px solid var(--border-mid)',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                        animation: 'confirmIn 0.25s cubic-bezier(0.4,0,0.2,1)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '24px' }}>
                            <div style={{
                                background: 'var(--error-bg)', color: 'var(--error-text)',
                                padding: '10px', borderRadius: '50%',
                                border: '1px solid var(--error-border)', flexShrink: 0,
                            }}>
                                <AlertTriangle size={20} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Confirm Action
                                </h3>
                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                                    {confirmDialog.message}
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                onClick={() => setConfirmDialog(null)}
                                style={{
                                    padding: '8px 18px', borderRadius: '8px',
                                    border: '1px solid var(--border-mid)',
                                    background: 'transparent', color: 'var(--text-secondary)',
                                    cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem',
                                    transition: 'all 0.15s',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    confirmDialog.onConfirm();
                                    setConfirmDialog(null);
                                }}
                                style={{
                                    padding: '8px 18px', borderRadius: '8px',
                                    border: '1px solid var(--error-border)',
                                    background: 'var(--error-bg)', color: 'var(--error-text)',
                                    cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                                    transition: 'all 0.15s',
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes toastIn {
                    from { opacity: 0; transform: translateY(16px) scale(0.95); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes confirmIn {
                    from { opacity: 0; transform: scale(0.94); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
