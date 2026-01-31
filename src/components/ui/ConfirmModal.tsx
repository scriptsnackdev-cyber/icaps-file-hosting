'use client';

import React, { useRef, useEffect } from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDanger = false
}: ConfirmModalProps) {

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all scale-100 animate-in zoom-in-95 duration-200 border border-slate-100">
                <div>
                    <h3 className={`text-lg font-semibold mb-2 ${isDanger ? 'text-red-600' : 'text-slate-800'}`}>{title}</h3>
                    {description && <p className="text-sm text-slate-500 mb-6 leading-relaxed">{description}</p>}
                </div>

                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-slate-500 hover:bg-slate-50 font-semibold rounded-xl transition-colors text-sm"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={`px-5 py-2.5 text-white font-semibold rounded-xl transition-all shadow-sm hover:shadow-md text-sm
                            ${isDanger
                                ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
