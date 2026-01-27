'use client';

import { createContext, useContext, useState, useCallback } from 'react';
// Import icons for different toast types
import { CheckCircleIcon, XMarkIcon, InfoIcon } from '@/components/shared/icons/Icons';

// Reusable Toast component
const ToastComponent = ({ message, show, type = 'success' }) => {
    // Added 'flex items-center gap-2' for icon and text alignment
    const baseClasses = "fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white font-semibold shadow-lg z-[100] transition-all duration-300 flex items-center gap-2";
    const typeClasses = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    const visibilityClasses = show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none';
    
    // Determine which icon to display based on the toast type
    const Icon = type === 'success' ? CheckCircleIcon : (type === 'error' ? XMarkIcon : InfoIcon);
    const iconClasses = "w-5 h-5"; // Standard icon size for consistency

    return (
        <div className={`${baseClasses} ${typeClasses[type]} ${visibilityClasses}`}>
            {/* Render the appropriate icon */}
            <Icon className={iconClasses} />
            {/* Wrap the message in a span for consistent spacing with the icon */}
            <span>{message}</span>
        </div>
    );
};

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = useCallback((message, type = 'success', duration = 3000) => {
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
