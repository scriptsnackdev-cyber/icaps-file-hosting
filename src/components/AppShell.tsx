'use client';

import React, { useState, useCallback } from 'react';
import { Menu, X, Bell, LogOut } from 'lucide-react';
import styles from '@/app/layout.module.css';

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <button className={styles.menuBtn} onClick={onClick} title="Menu" aria-label="Open navigation">
            <Menu size={18} />
        </button>
    );
}

export function SidebarDrawer({
    children,
    isOpen,
    onClose,
}: {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
}) {
    return (
        <>
            {/* Overlay */}
            <div
                className={`${styles.sidebarOverlay} ${isOpen ? styles.sidebarOverlayVisible : ''}`}
                onClick={onClose}
                aria-hidden="true"
            />
            {/* Sidebar itself gets sidebarOpen class when open */}
            <div className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
                {children}
            </div>
        </>
    );
}

export function AppShell({
    sidebar,
    header,
    children,
}: {
    sidebar: React.ReactNode;
    header: React.ReactNode;
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const openSidebar = useCallback(() => setSidebarOpen(true), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    return (
        <div className={styles.layout}>
            {/* Overlay */}
            <div
                className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.sidebarOverlayVisible : ''}`}
                onClick={closeSidebar}
                aria-hidden="true"
            />

            {/* Sidebar — on mobile: fixed drawer */}
            <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
                {sidebar}
            </div>

            {/* Main area */}
            <main className={styles.main}>
                <header className={styles.header}>
                    {/* Hamburger (only visible on mobile via CSS) */}
                    <button
                        className={styles.menuBtn}
                        onClick={openSidebar}
                        title="Menu"
                        aria-label="Open navigation"
                    >
                        <Menu size={18} />
                    </button>

                    {/* Rest of header */}
                    {header}
                </header>

                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}
