import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";
import { LogOut } from "lucide-react";
import { createClient } from '@/utils/supabase/server';
import { signOut } from '@/app/login/actions';
import { getTotalUsage, fetchUserProjects } from '@/app/actions';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import SearchBar from '@/components/SearchBar';
import { AppShell } from '@/components/AppShell';

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "ICAPS Cloud — Enterprise File System",
  description: "Secure enterprise file hosting powered by Next.js, Supabase and Cloudflare R2",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role = 'user';
  let initials = '?';
  let displayName = '';
  let totalUsageBytes = 0;
  let projects: { id: string; name: string; userRole: string | null }[] = [];

  if (user?.email) {
    displayName = user.email.split('@')[0];
    initials = displayName.substring(0, 2).toUpperCase();
    const { data: roleData } = await supabase
      .from('share_whitelist')
      .select('role')
      .eq('email', user.email)
      .single();
    if (roleData) role = roleData.role;
    totalUsageBytes = await getTotalUsage();
    projects = await fetchUserProjects();
  }

  const headerContent = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, minWidth: 0, gap: 12 }}>
      <SearchBar />
      <div className={styles.userProfile}>

        <form action={signOut} style={{ display: 'flex' }}>
          <button type="submit" className={styles.signOutBtn} title="Sign Out">
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </form>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border-soft)', flexShrink: 0 }} />

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div className={styles.userInfo} style={{ textAlign: 'right', lineHeight: 1.3 }}>
            <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {displayName}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {role}
            </div>
          </div>
          <div className={styles.avatar}>{initials}</div>
        </div>
      </div>
    </div>
  );

  return (
    <html lang="en">
      <body className={inter.className}>
        <ToastProvider>
          {!user ? (
            <div style={{ height: '100vh', width: '100vw' }}>{children}</div>
          ) : (
            <AppShell
              sidebar={<Sidebar initialProjects={projects || []} role={role} totalUsageBytes={totalUsageBytes} />}
              header={headerContent}
            >
              {children}
            </AppShell>
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
