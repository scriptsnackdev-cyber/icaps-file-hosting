'use client';

import React from 'react';
import { Home, FolderOpen, Clock, Star, Trash2, Cloud, Settings, LogOut } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/contexts/AuthContext';

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function Sidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { totalSize } = useStorage();
    const { isAdmin, userEmail, signOut } = useAuth();

    const navItems = [
        { icon: FolderOpen, label: 'My Files', path: '/drive' },
        ...(isAdmin ? [{ icon: Settings, label: 'Whitelist', path: '/admin/whitelist' }] : [])
    ];

    return (
        <div className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col fixed left-0 top-0 z-20 hidden md:flex">
            {/* App Logo */}
            <div className="h-16 flex items-center px-6 border-b border-slate-100">
                <div className="flex items-center gap-3 text-blue-600">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <Cloud className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-lg tracking-tight text-slate-800">CloudPoint</span>
                </div>
            </div>

            {/* Nav Items */}
            <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => router.push(item.path)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${(pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path)))
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                    >
                        <item.icon className={`w-5 h-5 ${(pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path)))
                            ? 'text-blue-600'
                            : 'text-slate-400'
                            }`} />
                        {item.label}
                    </button>
                ))}

                <div className="pt-6 mt-6 border-t border-slate-100">
                    <div className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Storage
                    </div>
                    <div className="px-3 py-2">
                        <div className="flex items-center gap-3 text-sm font-medium text-slate-600 mb-2">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                <Cloud className="w-4 h-4" />
                            </div>
                            <span>
                                {formatBytes(totalSize)} Used
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-500 h-1.5 rounded-full w-3/4"></div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 space-y-2">
                {userEmail && (
                    <div className="px-2 py-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logged in as</p>
                        <p className="text-sm font-medium text-slate-700 truncate" title={userEmail}>
                            {userEmail}
                        </p>
                    </div>
                )}
                <button
                    onClick={signOut}
                    className="flex items-center gap-3 px-3 py-2.5 w-full text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                </button>
            </div>
        </div>
    );
}
