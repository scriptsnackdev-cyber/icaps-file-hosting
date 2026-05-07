'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Folder, Clock, Trash2, ShieldCheck, Cloud, Plus, X, Pencil, Users, AlertTriangle, UserMinus, UserPlus, ChevronDown, ClipboardList } from 'lucide-react';
import styles from '@/app/layout.module.css';
import { createProject, renameProject, deleteProject, getProjectMembers, addProjectMember, updateProjectMemberRole, removeProjectMember } from '@/actions/project';
import { getWhitelistUsers } from '@/actions/admin';
import { useToast } from '@/components/Toast';
import ActivityLogModal from '@/components/ActivityLogModal';

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

    // ── Activity Log ──
    const [logTarget, setLogTarget] = useState<Project | null>(null);

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
        width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)',
        border: '1px solid var(--border-mid)', background: 'var(--bg-elevated)',
        color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box',
        fontFamily: 'var(--font)', outline: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
    };
    const btnPrimary: React.CSSProperties = {
        padding: '9px 18px', borderRadius: 'var(--r-md)', border: 'none',
        background: 'linear-gradient(135deg, var(--brand-start), var(--brand-mid))',
        color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
        fontFamily: 'var(--font)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
    };
    const btnGhost: React.CSSProperties = {
        padding: '9px 18px', borderRadius: 'var(--r-md)',
        border: '1px solid var(--border-mid)', background: 'transparent',
        color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'var(--font)',
    };
    const overlay: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    };
    const modalCard: React.CSSProperties = {
        background: 'var(--bg-surface)', borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border-mid)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)', width: '440px', maxWidth: 'calc(100vw - 32px)'
    };

    return (
        <aside style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* ── Logo ── */}
            <div className={styles.logoArea}>
                <div style={{ position: 'relative', width: '100%', height: '150px' }}>
                    <Image src="/ICAPS.png" alt="ICAPS Clouds Logo" fill sizes="200px" style={{ objectFit: 'contain', objectPosition: 'left' }} priority />
                </div>
            </div>

            {/* ── Nav ── */}
            <nav className={styles.nav}>
                {/* Projects section */}
                <div style={{ padding: '4px 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PROJECTS</span>
                    {role === 'admin' && (
                        <button
                            onClick={() => setShowNewProject(true)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 'var(--r-sm)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', transition: 'all var(--ease-fast)' }}
                            title="New Project"
                        >
                            <Plus size={13} />
                        </button>
                    )}
                </div>

                {projects.map(p => {
                    const isGuestActive = role === 'guest' && p.id === 'guest-root';
                    const isStandardActive = projectId === p.id && !isRecent && pathname === '/';
                    const isActive = role === 'guest' ? isGuestActive : isStandardActive;

                    return (
                        <Link
                            key={p.id}
                            href={role === 'guest' ? '#' : `/?projectId=${p.id}`}
                            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                            onContextMenu={canManage(p) && role !== 'guest' ? (e) => {
                                e.preventDefault();
                                setCtxMenu({ x: e.clientX, y: e.clientY, project: p });
                            } : undefined}
                            onClick={role === 'guest' ? (e) => e.preventDefault() : undefined}
                        >
                            <Folder size={16} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
                        </Link>
                    );
                })}

                {projects.length === 0 && (
                    <div style={{ padding: '6px 14px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No projects yet.</div>
                )}

                {/* Divider */}
                <div style={{ height: 1, background: 'var(--border-soft)', margin: '10px 4px' }} />

                {/* Recent */}
                {role !== 'guest' && (
                    <Link
                        href={`/?recent=true${projectId ? `&projectId=${projectId}` : ''}`}
                        className={`${styles.navItem} ${isRecent ? styles.navItemActive : ''}`}
                    >
                        <Clock size={16} style={{ flexShrink: 0 }} /> Recent Files
                    </Link>
                )}

                <div style={{ flex: 1 }} />

                {/* Admin */}
                {role === 'admin' && (
                    <Link
                        href="/admin"
                        className={`${styles.navItem} ${pathname === '/admin' ? styles.navItemActive : ''}`}
                        style={{ color: pathname === '/admin' ? undefined : '#a78bfa' }}
                    >
                        <ShieldCheck size={16} style={{ flexShrink: 0 }} /> Admin Whitelist
                    </Link>
                )}

                {/* Recycle bin (placeholder) */}
                {role !== 'guest' && (
                    <div className={styles.navItem} style={{ cursor: 'default', opacity: 0.35, pointerEvents: 'none' }}>
                        <Trash2 size={16} style={{ flexShrink: 0 }} /> Recycle Bin
                    </div>
                )}

                {/* ── Storage Usage — admin only ── */}
                {role === 'admin' && (
                    <div style={{ margin: '16px 4px 0', padding: '14px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <Cloud size={14} color="var(--brand-end)" /> Storage
                        </div>
                        <div style={{ height: '5px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden', marginBottom: '7px' }}>
                            <div style={{
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--brand-start), var(--brand-end))',
                                width: `min(100%, max(1%, ${((totalUsageBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(1)}%))`,
                                borderRadius: '3px',
                            }} />
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{formatSize(totalUsageBytes)} of 10 GB used</div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-soft)', paddingTop: '12px', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, color: 'var(--brand-end)', letterSpacing: '0.02em' }}>ICAPS CLOUDS</div>
                    <div style={{ marginTop: '2px', opacity: 0.7 }}>by Script Snack Dev</div>
                </div>
            </nav>

            {/* ── Context Menu ── */}
            {ctxMenu && typeof document !== 'undefined' && createPortal(
                <div
                    ref={ctxRef}
                    style={{
                        position: 'fixed',
                        top: Math.min(ctxMenu.y, window.innerHeight - 160),
                        left: Math.min(ctxMenu.x, window.innerWidth - 200),
                        background: 'var(--bg-overlay)',
                        border: '1px solid var(--border-mid)',
                        borderRadius: 'var(--r-md)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                        zIndex: 9999,
                        minWidth: '180px',
                        overflow: 'hidden',
                        padding: '4px',
                        animation: 'scaleIn 0.12s ease'
                    }}
                >
                    <div style={{ padding: '6px 14px 8px', fontSize: '0.72rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {ctxMenu.project.name}
                    </div>
                    {[
                        { icon: <Pencil size={14} />, label: 'Rename', color: 'var(--text-secondary)', action: () => { setRenameTarget(ctxMenu.project); setRenameValue(ctxMenu.project.name); closeCtx(); } },
                        { icon: <Users size={14} />, label: 'Manage Access', color: 'var(--text-secondary)', action: () => { openManage(ctxMenu.project); closeCtx(); } },
                        ...(ctxMenu.project.userRole === 'admin' ? [{ icon: <ClipboardList size={14} />, label: 'Activity Log', color: 'var(--text-secondary)', action: () => { setLogTarget(ctxMenu.project); closeCtx(); } }] : []),
                        { icon: <Trash2 size={14} />, label: 'Delete Project', color: 'var(--error-text)', action: () => { setDeleteTarget(ctxMenu.project); closeCtx(); } },
                    ].map(item => (
                        <button
                            key={item.label}
                            onClick={item.action}
                            style={{
                                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                                padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px',
                                color: item.color, fontSize: '0.855rem', textAlign: 'left', fontFamily: 'var(--font)',
                                fontWeight: 500, borderRadius: 'var(--r-sm)',
                                transition: 'background var(--ease-fast)'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                            {item.icon} {item.label}
                        </button>
                    ))}
                </div>, document.body
            )}

            {/* ── Create Project Modal ── */}
            {showNewProject && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setShowNewProject(false); }}>
                    <div style={modalCard}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>New Project</h3>
                            <button onClick={() => setShowNewProject(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
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

            {/* ── Rename Modal ── */}
            {renameTarget && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setRenameTarget(null); }}>
                    <div style={modalCard}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Rename Project</h3>
                            <button onClick={() => setRenameTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
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

            {/* ── Delete Confirm ── */}
            {deleteTarget && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
                    <div style={modalCard}>
                        <div style={{ padding: '28px 28px 20px', textAlign: 'center' }}>
                            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--error-bg)', border: '1px solid var(--error-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <AlertTriangle size={26} color="var(--error-text)" />
                            </div>
                            <h3 style={{ margin: '0 0 10px', fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>Delete Project?</h3>
                            <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                                This will permanently delete <strong style={{ color: 'var(--text-primary)' }}>&quot;{deleteTarget.name}&quot;</strong> and all files. This cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                <button onClick={() => setDeleteTarget(null)} style={btnGhost}>Cancel</button>
                                <button onClick={handleDelete} disabled={isDeleting} style={{ ...btnPrimary, background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-border)', boxShadow: 'none' }}>
                                    {isDeleting ? 'Deleting...' : 'Delete Project'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Manage Access Modal ── */}
            {manageTarget && (
                <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setManageTarget(null); }}>
                    <div style={{ ...modalCard, width: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Manage Access</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{manageTarget.name}</p>
                            </div>
                            <button onClick={() => setManageTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
                        </div>

                        {/* Members list */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
                            {loadingMembers ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Loading...</div>
                            ) : members.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No members yet.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                    {members.map(m => (
                                        <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
                                            <div style={{ width: '30px', height: '30px', borderRadius: 'var(--r-full)', background: 'linear-gradient(135deg, var(--brand-start), var(--brand-end))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                                                {m.email.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                                            </div>
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <select
                                                    value={m.role}
                                                    onChange={e => handleRoleChange(m.email, e.target.value)}
                                                    style={{ padding: '4px 24px 4px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-mid)', background: 'var(--bg-overlay)', color: 'var(--text-primary)', fontSize: '0.78rem', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
                                                >
                                                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                        <option key={val} value={val}>{label}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={12} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                                            </div>
                                            <button onClick={() => handleRemoveMember(m.email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error-text)', padding: '4px', borderRadius: 'var(--r-sm)', flexShrink: 0, display: 'flex', alignItems: 'center' }} title="Remove">
                                                <UserMinus size={15} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add member form */}
                        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-soft)', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                <UserPlus size={13} /> Add Member
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
                                            <ChevronDown size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                                        </div>
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <select value={addRole} onChange={e => setAddRole(e.target.value as typeof addRole)} style={{ height: '38px', padding: '0 28px 0 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-mid)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
                                                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                    <option key={val} value={val}>{label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                                        </div>
                                        <button type="submit" disabled={isAddingMember || !addEmail} style={{ ...btnPrimary, padding: '0 14px', height: '38px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                            {isAddingMember ? '...' : <UserPlus size={15} />}
                                        </button>
                                    </form>
                                );
                            })()}
                            {whitelistUsers.filter(u => !members.map(m => m.email).includes(u.email)).length === 0 && !loadingMembers && (
                                <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>All whitelisted users are already members.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Activity Log Modal ── */}
            {logTarget && (
                <ActivityLogModal
                    projectId={logTarget.id}
                    onClose={() => setLogTarget(null)}
                />
            )}
        </aside>
    );
}
