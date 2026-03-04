import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";
import { Bell, LogOut } from "lucide-react";
import { createClient } from '@/utils/supabase/server';
import { signOut } from '@/app/login/actions';
import { getTotalUsage, fetchUserProjects } from '@/app/actions';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import SearchBar from '@/components/SearchBar';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ICAPS-CLOUD - Enterprise File System",
  description: "A complete SharePoint clone powered by Next.js, Supabase, and Cloudflare R2",
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
  let totalUsageBytes = 0;
  let projects: { id: string; name: string; userRole: string | null }[] = [];

  if (user?.email) {
    initials = user.email.substring(0, 2).toUpperCase();
    const { data: roleData } = await supabase
      .from('share_whitelist')
      .select('role')
      .eq('email', user.email)
      .single();
    if (roleData) role = roleData.role;
    totalUsageBytes = await getTotalUsage();
    projects = await fetchUserProjects();
  }

  return (
    <html lang="en">
      <body className={inter.className}>
        <ToastProvider>
          {!user ? (
            <div style={{ height: '100vh', width: '100vw' }}>{children}</div>
          ) : (
            <div className={styles.layout}>
              <Sidebar initialProjects={projects || []} role={role} totalUsageBytes={totalUsageBytes} />

              {/* Main Workspace */}
              <main className={styles.main}>
                {/* Topbar Navigation */}
                <header className={`${styles.header} glass`}>
                  <SearchBar />
                  <div className={styles.userProfile}>
                    <Bell size={20} color="var(--text-light)" style={{ cursor: 'pointer', marginRight: '16px' }} />

                    <form action={signOut} style={{ display: 'flex', alignItems: 'center', marginRight: '16px' }}>
                      <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-light)' }}>
                        <LogOut size={16} /> Sign Out
                      </button>
                    </form>

                    <span>{user.email?.split('@')[0]}</span>
                    <div className={styles.avatar}>{initials}</div>
                  </div>
                </header>

                {/* Page Content */}
                <div className={styles.content}>
                  {children}
                </div>
              </main>
            </div>
          )}
        </ToastProvider>
      </body>
    </html>
  );
}

