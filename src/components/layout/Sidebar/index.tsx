'use client';

import React, { useState } from 'react';
import { FolderOpen, Trash2, Cloud, Settings, LogOut, FolderPlus, Menu, X } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';

import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useActionContext } from '@/contexts/ActionContext';

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
    const { projects, projectsLoading } = useActionContext();
    const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const navItems = [
        { icon: FolderOpen, label: 'My Files', path: '/drive' },
        { icon: Trash2, label: 'Trash', path: '/trash' },
        ...(isAdmin ? [{ icon: Settings, label: 'Whitelist', path: '/admin/whitelist' }] : [])
    ];

    const SidebarContent = () => (
        <>
            {/* App Logo */}
            <div className="h-24 flex items-center justify-between px-4 border-b border-slate-100">
                <div className="flex items-center text-blue-600">
                    <Image src="/ICAPS.png" alt="ICAPS Logo" width={128} height={128} className="w-28 h-auto object-contain" />
                </div>
                {/* Close button for mobile drawer */}
                <button
                    onClick={() => setIsMobileOpen(false)}
                    className="md:hidden p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Nav Items */}
            <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => { router.push(item.path); setIsMobileOpen(false); }}
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
                        Projects
                    </div>
                    <div className="space-y-1">
                        {projects.length === 0 && projectsLoading ? (
                            <div className="px-3 py-2 space-y-2">
                                <div className="h-8 bg-slate-50 rounded-lg animate-pulse" />
                                <div className="h-8 bg-slate-50 rounded-lg animate-pulse" />
                                <div className="h-8 bg-slate-50 rounded-lg animate-pulse" />
                            </div>
                        ) : projects.length > 0 ? (
                            projects.map((project) => {
                                const isActive = pathname === `/drive/${project.id}` || pathname.startsWith(`/drive/${project.id}/`);
                                return (
                                    <button
                                        key={project.id}
                                        onClick={() => { router.push(`/drive/${project.id}`); setIsMobileOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                                            ? 'bg-blue-50 text-blue-700 font-semibold'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                            }`}
                                    >
                                        <FolderPlus className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                                        <span className="truncate">{project.name}</span>
                                    </button>
                                );
                            })
                        ) : (
                            <p className="px-3 py-2 text-xs text-slate-400 italic">No projects found</p>
                        )}
                    </div>
                </div>

                {isAdmin && (
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
                )}
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
                    type="button"
                    onClick={() => setIsSignOutModalOpen(true)}
                    className="flex items-center gap-3 px-3 py-2.5 w-full text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                </button>

                <div className="pt-4 border-t border-slate-50">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
                        © 2026 ICAPS Clouds
                    </p>
                    <p className="text-[9px] text-slate-300 font-medium text-center">
                        Power by Script Snack Dev
                    </p>
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* ── Desktop Sidebar (hidden on mobile) ── */}
            <div className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col fixed left-0 top-0 z-20 hidden md:flex">
                <SidebarContent />
            </div>

            {/* ── Mobile: Top bar ── */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center px-4 gap-3">
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                    aria-label="Open menu"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <Image src="/ICAPS.png" alt="ICAPS Logo" width={80} height={32} className="h-8 w-auto object-contain" />
            </div>

            {/* ── Mobile: Slide-in drawer overlay ── */}
            {isMobileOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 flex"
                    onClick={() => setIsMobileOpen(false)}
                >
                    {/* Scrim */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

                    {/* Drawer panel */}
                    <div
                        className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <SidebarContent />
                    </div>
                </div>
            )}

            {/* ── Mobile: Bottom nav bar ── */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex items-stretch safe-bottom">
                {navItems.slice(0, 3).map((item) => {
                    const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                    return (
                        <button
                            key={item.label}
                            onClick={() => router.push(item.path)}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
                        >
                            <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                            {item.label}
                        </button>
                    );
                })}
                {/* Quick projects access */}
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-slate-400"
                >
                    <FolderPlus className="w-5 h-5" />
                    Projects
                </button>
            </div>

            {/* Sign Out Confirmation Modal */}
            {isSignOutModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform m-4 text-center">
                        <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LogOut className="w-6 h-6 ml-0.5" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Sign Out?</h3>
                        <p className="text-sm text-slate-500 mb-6">
                            Are you sure you want to sign out of your account?
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setIsSignOutModalOpen(false)}
                                className="flex-1 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    console.log("Sign Out clicked");
                                    await signOut();
                                    setIsSignOutModalOpen(false);
                                }}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-200 transition-all"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
