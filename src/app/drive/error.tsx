'use client';

import { useEffect } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Drive Error:', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-slate-50 rounded-xl m-4 border border-slate-200">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong!</h2>
            <p className="text-slate-500 mb-8 max-w-md">
                We encountered an unexpected error while loading your drive.
                Try refreshing the data.
            </p>
            <div className="flex gap-4">
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                    Reload Page
                </button>
                <button
                    onClick={reset}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
                >
                    <RotateCcw className="w-4 h-4" />
                    Try Again
                </button>
            </div>
            {error.message && (
                <p className="mt-8 text-xs text-slate-400 font-mono bg-slate-100 px-3 py-1 rounded">
                    Error: {error.message}
                </p>
            )}
        </div>
    );
}
