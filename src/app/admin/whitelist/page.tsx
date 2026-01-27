'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import {
    UserPlus, Trash2, Mail, Shield, User as UserIcon,
    Search, Loader2, RefreshCcw, ChevronLeft
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/contexts/ToastContext';
import { useRouter } from 'next/navigation';
import { WhitelistUser } from '@/types';

export default function WhitelistPage() {
    const [whitelist, setWhitelist] = useState<WhitelistUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

    // New User Form
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

    const { showToast } = useToast();
    const router = useRouter();
    const supabase = createClient();

    const fetchWhitelist = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/whitelist');
            if (res.ok) {
                const data = await res.json();
                setWhitelist(data);
            } else {
                const err = await res.json();
                if (res.status === 403) {
                    showToast("Access Denied: Admins Only", "error");
                    router.push('/drive');
                } else {
                    showToast(err.error || "Failed to fetch whitelist", "error");
                }
            }
        } catch (e) {
            console.error(e);
            showToast("Network error", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setCurrentUserEmail(user.email || null);
        };
        fetchUser();
        fetchWhitelist();
    }, []);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail.trim()) return;

        try {
            const res = await fetch('/api/admin/whitelist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newEmail.trim().toLowerCase(), role: newRole })
            });

            if (res.ok) {
                showToast("User added to whitelist", "success");
                setNewEmail('');
                setIsAdding(false);
                fetchWhitelist();
            } else {
                const err = await res.json();
                showToast(err.error || "Failed to add user", "error");
            }
        } catch (e) {
            showToast("Error adding user", "error");
        }
    };

    const handleDeleteUser = async (email: string) => {
        if (email === currentUserEmail) {
            showToast("You cannot remove yourself from the whitelist!", "error");
            return;
        }
        if (!confirm(`Are you sure you want to remove ${email} from the whitelist?`)) return;

        try {
            const res = await fetch(`/api/admin/whitelist?email=${encodeURIComponent(email)}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                showToast("User removed", "success");
                setWhitelist(prev => prev.filter(u => u.email !== email));
            } else {
                const err = await res.json();
                showToast(err.error || "Failed to remove user", "error");
            }
        } catch (e) {
            showToast("Error removing user", "error");
        }
    };

    const filteredWhitelist = whitelist.filter(u =>
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            <Sidebar />

            <main className="flex-1 ml-0 md:ml-64 p-8 relative">
                <div className="max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <button
                                onClick={() => router.push('/drive')}
                                className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors mb-2 text-sm"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back to Drive
                            </button>
                            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Whitelist Management</h1>
                            <p className="text-slate-500 mt-1">Manage users who are allowed to access the platform.</p>
                        </div>

                        <button
                            onClick={() => setIsAdding(true)}
                            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                        >
                            <UserPlus className="w-5 h-5" />
                            Add User
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by email..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>
                        <button
                            onClick={fetchWhitelist}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Refresh"
                        >
                            <RefreshCcw className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                            <p className="text-slate-500 font-medium">Loading whitelist...</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500 tracking-wider">User</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500 tracking-wider">Role</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500 tracking-wider">Added date</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-slate-500 tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredWhitelist.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-16 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Mail className="w-12 h-12 text-slate-200" />
                                                    <p className="text-slate-400 font-medium">No whitelisted users found.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredWhitelist.map((user) => (
                                            <tr key={user.email} className="group hover:bg-blue-50/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-bold border border-white shadow-sm">
                                                            {user.email[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-slate-800">{user.email}</div>
                                                            <div className="text-xs text-slate-400">Authorized user</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${user.role === 'admin'
                                                        ? 'bg-purple-50 text-purple-700 border border-purple-100'
                                                        : 'bg-blue-50 text-blue-700 border border-blue-100'
                                                        }`}>
                                                        {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-400">
                                                    --
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {user.email !== currentUserEmail ? (
                                                        <button
                                                            onClick={() => handleDeleteUser(user.email)}
                                                            className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                            title="Delete user"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-slate-300 font-medium px-2 py-1 bg-slate-50 rounded-md">You</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Add User Modal */}
                {isAdding && (
                    <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transform">
                            <div className="mb-6">
                                <h3 className="text-2xl font-bold text-slate-800 mb-2">Add to Whitelist</h3>
                                <p className="text-slate-500 mb-6 font-medium">Add an email address to allow access to the platform.</p>

                                <form onSubmit={handleAddUser} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input
                                                autoFocus
                                                type="email"
                                                required
                                                value={newEmail}
                                                onChange={e => setNewEmail(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
                                                placeholder="user@example.com"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Account Type</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setNewRole('user')}
                                                className={`py-3 px-4 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${newRole === 'user'
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                                    }`}
                                            >
                                                <UserIcon className="w-6 h-6" />
                                                <span className="font-bold text-sm">User</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewRole('admin')}
                                                className={`py-3 px-4 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${newRole === 'admin'
                                                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                                                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                                    }`}
                                            >
                                                <Shield className="w-6 h-6" />
                                                <span className="font-bold text-sm">Admin</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-6">
                                        <button
                                            type="button"
                                            onClick={() => setIsAdding(false)}
                                            className="flex-1 py-3.5 text-slate-600 hover:bg-slate-100 rounded-2xl font-bold transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all transform active:scale-95"
                                        >
                                            Add User
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
