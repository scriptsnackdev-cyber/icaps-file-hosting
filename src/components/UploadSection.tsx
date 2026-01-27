'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import { Upload, FileUp, CheckCircle2, AlertTriangle, CloudUpload } from 'lucide-react';
import { UploadStatus } from '@/types';

interface UploadSectionProps {
    onUploadComplete: () => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({ onUploadComplete }) => {
    const [status, setStatus] = useState<UploadStatus>({
        isUploading: false,
        progress: 0,
        fileName: null,
        error: null,
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const uploadFile = (file: File) => {
        setStatus({ isUploading: true, progress: 0, fileName: file.name, error: null });

        const xhr = new XMLHttpRequest();
        // Use Next.js API route
        xhr.open('PUT', `/api/files/${encodeURIComponent(file.name)}`);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                setStatus(prev => ({ ...prev, progress: Math.round(percent) }));
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                setStatus(prev => ({ ...prev, isUploading: false, progress: 100 }));
                setTimeout(() => {
                    setStatus({ isUploading: false, progress: 0, fileName: null, error: null });
                    onUploadComplete();
                }, 1500);
            } else {
                setStatus(prev => ({ ...prev, isUploading: false, error: `Upload failed: ${xhr.statusText}` }));
            }
        };

        xhr.onerror = () => {
            setStatus(prev => ({ ...prev, isUploading: false, error: 'Network error occurred during upload' }));
        };

        xhr.send(file);
    };

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            uploadFile(e.target.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            uploadFile(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-8 transition-all duration-300 hover:shadow-xl">
            {!status.isUploading && !status.fileName ? (
                <div
                    className="relative overflow-hidden group border-2 border-dashed border-slate-300 rounded-xl p-10 text-center transition-all cursor-pointer hover:border-blue-500 hover:bg-blue-50/50"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-sm">
                        <CloudUpload className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-2">Upload a file</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto">
                        Drag and drop your files here, or click to browse. Support all file types.
                    </p>
                </div>
            ) : (
                <div className="p-6 border border-slate-200 rounded-xl bg-slate-50/80">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-4">
                            <div className={`p-3 rounded-lg shadow-sm ${status.error ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                {status.error ? <AlertTriangle className="w-6 h-6" /> : <FileUp className="w-6 h-6" />}
                            </div>
                            <div>
                                <p className="font-semibold text-slate-800 text-sm truncate max-w-[200px] sm:max-w-md">
                                    {status.fileName}
                                </p>
                                <p className={`text-xs mt-1 font-medium ${status.error ? 'text-red-500' : 'text-slate-500'}`}>
                                    {status.error ? status.error : status.progress === 100 ? 'Upload Complete' : 'Uploading...'}
                                </p>
                            </div>
                        </div>
                        {status.progress === 100 && !status.error && (
                            <CheckCircle2 className="w-7 h-7 text-green-500 animate-in fade-in zoom-in spin-in-90" />
                        )}
                    </div>

                    {!status.error && (
                        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                style={{ width: `${status.progress}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
