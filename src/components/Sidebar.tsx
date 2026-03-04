'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Folder, Clock, Trash2, ShieldCheck, Cloud, Plus, X, Pencil, Users, AlertTriangle, UserMinus, UserPlus, ChevronDown } from 'lucide-react';
import styles from '@/app/layout.module.css';
import { createProject, renameProject, deleteProject, getProjectMembers, addProjectMember, updateProjectMemberRole, removeProjectMember, getWhitelistUsers } from '@/app/actions';
import { useToast } from '@/components/Toast';

type Project = { id: string; name: string; userRole: string | null };
type Member = { project_id: string; email: string; role: string; created_at: string };

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', member: 'Member', read_only: 'Read Only' };

export default function Sidebar({
    initialProjects,
    role,
    totalUsageBytes
}: {
    initialProjects: Project[];
    role: string;
    totalUsageBytes: number;
}) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { showToast } = useToast();

    const projectId = searchParams?.get('projectId') || null;
    const isRecent = searchParams?.get('recent') === 'true';

    const [projects, setProjects] = useState<Project[]>(initialProjects);

    // ── New Project modal ──
    const [showNewProject, setShowNewProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Context menu ──
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; project: Project } | null>(null);
    const ctxRef = useRef<HTMLDivElement>(null);

    // ── Rename modal ──
    const [renameTarget, setRenameTarget] = useState<Project | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // ── Delete confirm ──
    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // ── Access Manage modal ──
    const [manageTarget, setManageTarget] = useState<Project | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [whitelistUsers, setWhitelistUsers] = useState<{ email: string; role: string }[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [addEmail, setAddEmail] = useState('');
    const [addRole, setAddRole] = useState<'admin' | 'member' | 'read_only'>('member');
    const [isAddingMember, setIsAddingMember] = useState(false);

    // Close context menu on outside click
    const closeCtx = useCallback(() => setCtxMenu(null), []);
    useEffect(() => {
        if (!ctxMenu) return;
        const handler = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) closeCtx();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [ctxMenu, closeCtx]);

    // Helper: can the current user manage a project?
    const canManage = (p: Project) => role === 'admin' || p.userRole === 'admin';

    // ── Handlers ──
    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        setIsSubmitting(true);
        try {
            const res = await createProject(newProjectName, 'A new project workspace');
            if (res.success) {
                showToast('Project created', 'success');
                setShowNewProject(false);
                setNewProjectName('');
                setProjects(prev => [...prev, { id: res.id, name: newProjectName, userRole: 'admin' }]);
                router.push(`/?projectId=${res.id}`);
            }
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Error creating project', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renameTarget || !renameValue.trim()) return;
        setIsSubmitting(true);
        try {
            await renameProject(renameTarget.id, renameValue.trim());
            setProjects(prev => prev.map(p => p.id === renameTarget.id ? { ...p, name: renameValue.trim() } : p));
            showToast('Project renamed', 'success');
            setRenameTarget(null);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Error renaming project', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await deleteProject(deleteTarget.id);
            setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
            showToast('Project deleted', 'success');
            setDeleteTarget(null);
            if (projectId === deleteTarget.id) router.push('/');
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Error deleting project', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const openManage = async (project: Project) => {
        setManageTarget(project);
        setLoadingMembers(true);
        try {
            const [membersData, whitelist] = await Promise.all([
                getProjectMembers(project.id),
                getWhitelistUsers()
            ]);
            setMembers(membersData as Member[]);
            setWhitelistUsers(whitelist);
            setAddEmail('');
        } catch {
            showToast('Failed to load members', 'error');
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manageTarget || !addEmail.trim()) return;
        setIsAddingMember(true);
        try {
            await addProjectMember(manageTarget.id, addEmail.trim(), addRole);
            const data = await getProjectMembers(manageTarget.id);
            setMembers(data as Member[]);
            setAddEmail('');
            showToast('Member added', 'success');
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to add member', 'error');
        } finally {
            setIsAddingMember(false);
        }
    };

    const handleRoleChange = async (email: string, newRole: string) => {
        if (!manageTarget) return;
        try {
            await updateProjectMemberRole(manageTarget.id, email, newRole as 'admin' | 'member' | 'read_only');
            setMembers(prev => prev.map(m => m.email === email ? { ...m, role: newRole } : m));
            showToast('Role updated', 'success');
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to update role', 'error');
        }
    };

    const handleRemoveMember = async (email: string) => {
        if (!manageTarget) return;
        try {
            await removeProjectMember(manageTarget.id, email);
            setMembers(prev => prev.filter(m => m.email !== email));
            showToast('Member removed', 'success');
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to remove member', 'error');
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const mb = bytes / (1024 * 1024);
        if (mb < 1000) return mb.toFixed(1) + ' MB';
        return (mb / 1024).toFixed(2) + ' GB';
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', borderRadius: '6px',
        border: '1px solid var(--border-color)', background: 'var(--bg-color)',
        color: 'var(--text-dark)', fontSize: '0.9rem', boxSizing: 'border-box'
    };
    const btnPrimary: React.CSSProperties = {
        padding: '9px 18px', borderRadius: '6px', border: 'none',
        background: 'var(--primary-color)', color: 'white', cursor: 'pointer',
        fontWeight: 600, fontSize: '0.9rem'
    };
    const btnGhost: React.CSSProperties = {
        padding: '9px 18px', borderRadius: '6px',
        border: '1px solid var(--border-color)', background: 'transparent',
        color: 'var(--text-dark)', cursor: 'pointer', fontSize: '0.9rem'
    };
    const overlay: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    };
    const modalCard: React.CSSProperties = {
        background: 'var(--surface-color)', borderRadius: '14px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)', width: '440px', maxWidth: 'calc(100vw - 32px)'
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.logoArea} style={{ padding: '16px 20px', height: '120px' }}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/ICAPS.png" alt="ICAPS Clouds Logo" fill sizes="(max-width: 768px) 100vw, 200px" style={{ objectFit: 'contain', objectPosition: 'left' }} priority />
                </div>
            </div>
            <nav className={styles.nav}>
                <div style={{ padding: '0 16px', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>PROJECTS</span>
                    {role === 'admin' && (
                        <button onClick={() => setShowNewProject(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)' }}>
                            <Plus size={16} />
                        </button>
                    )}
                </div>

                {projects.map(p => {
                    const isActive = projectId === p.id && !isRecent && pathname === '/';
                    return (
                        <Link
                            key={p.id}
                            href={`/?projectId=${p.id}`}
                            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                            onContextMenu={canManage(p) ? (e) => {
                                e.preventDefault();
                                setCtxMenu({ x: e.clientX, y: e.clientY, project: p });
                            } : undefined}
                        >
                            <Folder size={20} />
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
                        </Link>
                    );
                })}

                {projects.length === 0 && (
                    <div style={{ padding: '0 16px', fontSize: '0.85rem', color: 'var(--text-light)' }}>No projects found.</div>
                )}

                <div style={{ height: '16px' }} />

                <Link href={`/?recent=true${projectId ? `&projectId=${projectId}` : ''}`} className={`${styles.navItem} ${isRecent ? styles.navItemActive : ''}`}>
                    <Clock size={20} /> Recent Files
                </Link>

                <div style={{ flex: 1 }} />

                {role === 'admin' && (
                    <Link href="/admin" className={`${styles.navItem} ${pathname === '/admin' ? styles.navItemActive : ''}`} style={{ color: '#8b5cf6' }}>
                        <ShieldCheck size={20} /> Admin Whitelist
                    </Link>
                )}

                <div className={styles.navItem} style={{ cursor: 'default', opacity: 0.5 }}>
                    <Trash2 size={20} /> Recycle Bin
                </div>

                <div style={{ marginTop: '24px', padding: '16px', background: 'var(--surface-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Cloud size={16} color="var(--primary-color)" /> Storage Used
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-color)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                        <div style={{ height: '100%', background: 'var(--primary-color)', width: 'min(100%, max(1%, ' + ((totalUsageBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(1) + '%))' }} />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{formatSize(totalUsageBytes)} used</div>
                </div>

                <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-light)', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>© 2026 ICAPS CLOUDS</div>
                    <div style={{ marginTop: '4px', opacity: 0.8 }}>Powered by Script Snack Dev</div>
                </div>
            </nav>

            {/* ──────────── Context Menu ──────────── */}
            {ctxMenu && (
                <div
                    ref={ctxRef}
                    style={{
                        position: 'fixed',
                        top: Math.min(ctxMenu.y, window.innerHeight - 160),
                        left: Math.min(ctxMenu.x, window.innerWidth - 200),
                        background: 'var(--surface-color)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                        zIndex: 9999,
                        minWidth: '180px',
                        overflow: 'hidden',
                        padding: '4px 0',
                        animation: 'fadeIn 0.12s ease'
                    }}
                >
                    <div style={{ padding: '6px 14px 8px', fontSize: '0.75rem', color: 'var(--text-light)', borderBottom: '1px solid var(--border-color)', fontWeight: 600, letterSpacing: '0.03em' }}>
                        {ctxMenu.project.name}
                    </div>
                    {[
                        { icon: <Pencil size={15} />, label: 'Rename', color: 'var(--text-dark)', action: () => { setRenameTarget(ctxMenu.project); setRenameValue(ctxMenu.project.name); closeCtx(); } },
                        { icon: <Users size={15} />, label: 'Access Manage', color: 'var(--text-dark)', action: () => { openManage(ctxMenu.project); closeCtx(); } },
                        { icon: <Trash2 size={15} />, label: 'Delete Project', color: '#ef4444', action: () => { setDeleteTarget(ctxMenu.project); closeCtx(); } },
                    ].map(item => (
                        <button
                            key={item.label}
                            onClick={item.action}
                            style={{
                                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                                padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '10px',
                                color: item.color, fontSize: '0.9rem', textAlign: 'left',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary-color)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                            {item.icon} {item.label}
                        </button>
                    ))}
                </div>
            )}

            {/* ──────────── Create Project Modal ──────────── */}
            {showNewProject && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setShowNewProject(false); }}>
                    <div style={modalCard}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Create New Project</h3>
                            <button onClick={() => setShowNewProject(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreateProject} style={{ padding: '20px 24px' }}>
                            <input autoFocus type="text" placeholder="Project Name" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setShowNewProject(false)} style={btnGhost}>Cancel</button>
                                <button type="submit" disabled={isSubmitting} style={btnPrimary}>{isSubmitting ? 'Creating...' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────────── Rename Modal ──────────── */}
            {renameTarget && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setRenameTarget(null); }}>
                    <div style={modalCard}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Rename Project</h3>
                            <button onClick={() => setRenameTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleRename} style={{ padding: '20px 24px' }}>
                            <input autoFocus type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setRenameTarget(null)} style={btnGhost}>Cancel</button>
                                <button type="submit" disabled={isSubmitting} style={btnPrimary}>{isSubmitting ? 'Saving...' : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────────── Delete Confirm Modal ──────────── */}
            {deleteTarget && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
                    <div style={modalCard}>
                        <div style={{ padding: '24px', textAlign: 'center' }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <AlertTriangle size={28} color="#ef4444" />
                            </div>
                            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Delete Project?</h3>
                            <p style={{ margin: '0 0 20px', color: 'var(--text-light)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                This will permanently delete <strong>&quot;{deleteTarget.name}&quot;</strong> and all files inside it. This action cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                <button onClick={() => setDeleteTarget(null)} style={btnGhost}>Cancel</button>
                                <button onClick={handleDelete} disabled={isDeleting} style={{ ...btnPrimary, background: '#ef4444' }}>
                                    {isDeleting ? 'Deleting...' : 'Delete Project'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────────── Access Manage Modal ──────────── */}
            {manageTarget && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setManageTarget(null); }}>
                    <div style={{ ...modalCard, width: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Access Manage</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-light)' }}>{manageTarget.name}</p>
                            </div>
                            <button onClick={() => setManageTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><X size={20} /></button>
                        </div>

                        {/* Members list */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
                            {loadingMembers ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-light)' }}>Loading...</div>
                            ) : members.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-light)', fontSize: '0.9rem' }}>No members yet.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                    {members.map(m => (
                                        <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--secondary-color)', border: '1px solid var(--border-color)' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                                                {m.email.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                                            </div>
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <select
                                                    value={m.role}
                                                    onChange={e => handleRoleChange(m.email, e.target.value)}
                                                    style={{ padding: '4px 24px 4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-dark)', fontSize: '0.8rem', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
                                                >
                                                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                        <option key={val} value={val}>{label}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={12} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-light)' }} />
                                            </div>
                                            <button onClick={() => handleRemoveMember(m.email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', borderRadius: '4px', flexShrink: 0 }} title="Remove member">
                                                <UserMinus size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add member form */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <UserPlus size={14} /> ADD MEMBER
                            </div>
                            {(() => {
                                const memberEmails = new Set(members.map(m => m.email));
                                const available = whitelistUsers.filter(u => !memberEmails.has(u.email));
                                return (
                                    <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <select
                                                value={addEmail}
                                                onChange={e => setAddEmail(e.target.value)}
                                                required
                                                style={{ ...inputStyle, padding: '9px 28px 9px 12px', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}
                                            >
                                                <option value="">Select a user...</option>
                                                {available.map(u => (
                                                    <option key={u.email} value={u.email}>{u.email}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-light)' }} />
                                        </div>
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <select value={addRole} onChange={e => setAddRole(e.target.value as typeof addRole)} style={{ height: '38px', padding: '0 28px 0 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-dark)', fontSize: '0.85rem', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
                                                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                    <option key={val} value={val}>{label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-light)' }} />
                                        </div>
                                        <button type="submit" disabled={isAddingMember || !addEmail} style={{ ...btnPrimary, padding: '0 16px', height: '38px', flexShrink: 0 }}>
                                            {isAddingMember ? '...' : <UserPlus size={16} />}
                                        </button>
                                    </form>
                                );
                            })()}
                            {whitelistUsers.filter(u => !members.map(m => m.email).includes(u.email)).length === 0 && !loadingMembers && (
                                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--text-light)' }}>All whitelisted users are already members.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}
