'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, AlertCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
    show: boolean;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const ToastComponent = ({ message, show, type = 'success' }: ToastState) => {
    const baseClasses = "fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl text-white font-medium shadow-xl z-[100] transition-all duration-300 flex items-center gap-3 backdrop-blur-md";

    // Updated colors for a more premium look
    const typeClasses = {
        success: 'bg-slate-800/90 text-white',
        error: 'bg-red-500/90 text-white',
        info: 'bg-blue-600/90 text-white'
    };

    const visibilityClasses = show ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none';

    const Icon = type === 'success' ? CheckCircle2 : (type === 'error' ? XCircle : Info);
    const iconColors = type === 'success' ? 'text-green-400' : (type === 'error' ? 'text-white' : 'text-white');

    return (
        <div className={`${baseClasses} ${typeClasses[type]} ${visibilityClasses}`}>
            <Icon className={`w-5 h-5 ${iconColors}`} />
            <span className="text-sm">{message}</span>
        </div>
    );
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

    const showToast = useCallback((message: string, type: ToastType = 'success', duration: number = 3000) => {
        setToast({ show: true, message, type });
        setTimeout(() => {
            setToast(prev => ({ ...prev, show: false }));
        }, duration);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <ToastComponent {...toast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
