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

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

    const showToast = (message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
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

            {/* Toasts Container */}
            <div style={{
                position: 'fixed',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 9999,
                alignItems: 'center',
                pointerEvents: 'none'
            }}>
                {toasts.map((toast) => (
                    <div key={toast.id} style={{
                        background: toast.type === 'error' ? '#fee2e2' : toast.type === 'success' ? '#dcfce7' : '#e0f2fe',
                        color: toast.type === 'error' ? '#991b1b' : toast.type === 'success' ? '#166534' : '#075985',
                        padding: '12px 20px',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        pointerEvents: 'auto',
                        border: `1px solid ${toast.type === 'error' ? '#f87171' : toast.type === 'success' ? '#4ade80' : '#38bdf8'}`,
                        animation: 'slideUp 0.3s ease-out'
                    }}>
                        {toast.type === 'success' && <CheckCircle size={18} />}
                        {toast.type === 'error' && <AlertTriangle size={18} />}
                        {toast.type === 'info' && <Info size={18} />}
                        <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{toast.message}</span>
                        <button onClick={() => removeToast(toast.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', opacity: 0.6 }}>
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Confirm Modal */}
            {confirmDialog && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'var(--surface-color)',
                        padding: '24px',
                        borderRadius: '12px',
                        width: '400px',
                        maxWidth: '90%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        border: '1px solid var(--border-color)',
                        animation: 'modalSlideIn 0.3s ease-out'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                            <div style={{ background: '#fee2e2', color: '#ef4444', padding: '12px', borderRadius: '50%' }}>
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: 'var(--text-dark)' }}>Confirm Action</h3>
                                <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.95rem', lineHeight: 1.5 }}>
                                    {confirmDialog.message}
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                            <button
                                onClick={() => setConfirmDialog(null)}
                                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-dark)', cursor: 'pointer', fontWeight: 500 }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    confirmDialog.onConfirm();
                                    setConfirmDialog(null);
                                }}
                                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes modalSlideIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
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
