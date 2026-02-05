'use client';

import React, { useRef, useEffect } from 'react';

interface InputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (value: string) => void;
    title: string;
    description?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
}

export function InputModal({
    isOpen,
    onClose,
    onSubmit,
    title,
    description,
    placeholder,
    defaultValue = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDanger = false
}: InputModalProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const value = inputRef.current?.value || '';
        onSubmit(value);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <form
                onSubmit={handleSubmit}
                className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all scale-100 animate-in zoom-in-95 duration-200 border border-slate-100"
            >
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">{title}</h3>
                    {description && <p className="text-sm text-slate-500 mb-4">{description}</p>}
                </div>

                <input
                    ref={inputRef}
                    defaultValue={defaultValue}
                    placeholder={placeholder}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 font-medium mb-6"
                />

                <div className="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 text-slate-500 hover:bg-slate-50 font-semibold rounded-xl transition-colors text-sm"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="submit"
                        className={`px-5 py-2.5 text-white font-semibold rounded-xl transition-all shadow-sm hover:shadow-md text-sm
                            ${isDanger
                                ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </form>
        </div>
    );
}
