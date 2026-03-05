'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, Users, Shield, ChevronRight, FolderOpen, HardDrive } from 'lucide-react';

type Project = { id: string; name: string; userRole: string | null; totalBytes: number };

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    admin: {
        label: 'Admin',
        color: '#a78bfa',
        bg: 'rgba(139, 92, 246, 0.12)',
        border: 'rgba(139, 92, 246, 0.3)',
    },
    member: {
        label: 'Member',
        color: '#60a5fa',
        bg: 'rgba(96, 165, 250, 0.12)',
        border: 'rgba(96, 165, 250, 0.3)',
    },
    read_only: {
        label: 'Read Only',
        color: '#94a3b8',
        bg: 'rgba(148, 163, 184, 0.1)',
        border: 'rgba(148, 163, 184, 0.2)',
    },
};

// Gradient palettes — rotates per project for visual variety
const CARD_GRADIENTS = [
    ['#6366f1', '#8b5cf6'],
    ['#06b6d4', '#6366f1'],
    ['#8b5cf6', '#ec4899'],
    ['#10b981', '#06b6d4'],
    ['#f59e0b', '#ef4444'],
    ['#ec4899', '#8b5cf6'],
    ['#3b82f6', '#06b6d4'],
    ['#14b8a6', '#6366f1'],
];

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ProjectDashboard({ projects }: { projects: Project[] }) {
    const router = useRouter();
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // Only show projects where the user is actually a member
    const myProjects = projects.filter(p => p.userRole !== null);

    return (
        <div style={{
            minHeight: '100%',
            padding: '8px 4px 40px',
            animation: 'fadeIn 0.4s ease-out both',
        }}>
            {/* ── Header ── */}
            <div style={{ marginBottom: 36 }}>
                <h1 style={{
                    fontSize: '1.6rem', fontWeight: 800,
                    color: 'var(--text-primary)', letterSpacing: '-0.02em',
                    marginBottom: 8,
                }}>
                    Welcome back 👋
                </h1>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Select a project to get started, or browse your recent files.
                </p>
            </div>

            {/* ── No projects state ── */}
            {myProjects.length === 0 ? (
                <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: '80px 24px', textAlign: 'center',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--r-lg)',
                    border: '1px dashed var(--border-mid)',
                }}>
                    <div style={{
                        width: 72, height: 72,
                        borderRadius: '50%',
                        background: 'var(--bg-overlay)',
                        border: '1px solid var(--border-mid)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 20,
                    }}>
                        <FolderOpen size={32} color="var(--text-muted)" />
                    </div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                        No projects yet
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: 340, lineHeight: 1.6 }}>
                        You have not been added to any project yet. Ask an admin to invite you.
                    </p>
                </div>
            ) : (
                <>
                    {/* ── Section label ── */}
                    <div style={{
                        fontSize: '0.7rem', fontWeight: 700,
                        color: 'var(--text-muted)',
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        marginBottom: 16,
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <span>My Projects</span>
                        <span style={{
                            padding: '1px 8px', borderRadius: 'var(--r-full)',
                            background: 'var(--bg-overlay)', border: '1px solid var(--border-soft)',
                            fontSize: '0.68rem', color: 'var(--text-secondary)',
                        }}>{myProjects.length}</span>
                    </div>

                    {/* ── Card grid ── */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: 20,
                    }}>
                        {myProjects.map((project, idx) => {
                            const [g1, g2] = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
                            const roleConf = ROLE_CONFIG[project.userRole || 'read_only'];
                            const isHovered = hoveredId === project.id;

                            return (
                                <div
                                    key={project.id}
                                    onClick={() => router.push(`/?projectId=${project.id}`)}
                                    onMouseEnter={() => setHoveredId(project.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    style={{
                                        background: 'var(--bg-surface)',
                                        border: `1px solid ${isHovered ? 'rgba(139,92,246,0.4)' : 'var(--border-soft)'}`,
                                        borderRadius: 'var(--r-lg)',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        transform: isHovered ? 'translateY(-4px)' : 'none',
                                        boxShadow: isHovered
                                            ? `0 20px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.2), 0 0 32px ${g1}22`
                                            : '0 2px 8px rgba(0,0,0,0.3)',
                                        position: 'relative',
                                    }}
                                >
                                    {/* Color bar */}
                                    <div style={{
                                        height: 5,
                                        background: `linear-gradient(90deg, ${g1}, ${g2})`,
                                        opacity: isHovered ? 1 : 0.7,
                                        transition: 'opacity 0.2s',
                                    }} />

                                    {/* Card body */}
                                    <div style={{ padding: '20px 22px 22px' }}>
                                        {/* Icon + role badge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                                            <div style={{
                                                width: 48, height: 48,
                                                borderRadius: 'var(--r-md)',
                                                background: `linear-gradient(135deg, ${g1}22, ${g2}22)`,
                                                border: `1px solid ${g1}44`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'transform 0.2s',
                                                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                                            }}>
                                                <Folder
                                                    size={24}
                                                    style={{ color: g1 }}
                                                    fill={g1}
                                                    fillOpacity={0.25}
                                                />
                                            </div>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: 'var(--r-full)',
                                                background: roleConf.bg,
                                                border: `1px solid ${roleConf.border}`,
                                                color: roleConf.color,
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.03em',
                                                display: 'flex', alignItems: 'center', gap: 5,
                                            }}>
                                                {project.userRole === 'admin' && <Shield size={10} />}
                                                {project.userRole === 'member' && <Users size={10} />}
                                                {roleConf.label}
                                            </span>
                                        </div>

                                        {/* Project name */}
                                        <h3 style={{
                                            fontSize: '1rem',
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                            marginBottom: 4,
                                            letterSpacing: '-0.01em',
                                            lineHeight: 1.3,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {project.name}
                                        </h3>

                                        {/* Storage size */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 5,
                                            marginBottom: 18,
                                        }}>
                                            <HardDrive size={12} color="var(--text-muted)" />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                                {formatBytes(project.totalBytes)} used
                                            </span>
                                        </div>

                                        {/* Footer CTA */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            paddingTop: 14,
                                            borderTop: '1px solid var(--border-soft)',
                                        }}>
                                            <span style={{
                                                fontSize: '0.78rem', fontWeight: 600,
                                                background: `linear-gradient(90deg, ${g1}, ${g2})`,
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                transition: 'opacity 0.2s',
                                                opacity: isHovered ? 1 : 0.7,
                                            }}>
                                                Open Project
                                            </span>
                                            <div style={{
                                                width: 28, height: 28,
                                                borderRadius: 'var(--r-sm)',
                                                background: isHovered ? `${g1}22` : 'var(--bg-overlay)',
                                                border: `1px solid ${isHovered ? g1 + '55' : 'var(--border-soft)'}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s',
                                                transform: isHovered ? 'translateX(3px)' : 'none',
                                            }}>
                                                <ChevronRight size={14} color={isHovered ? g1 : 'var(--text-muted)'} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
