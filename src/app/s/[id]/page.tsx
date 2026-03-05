import { getShareLinkDetails, verifyShareLink } from '@/app/actions';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import ClientShareAccess from './ClientShareAccess';
import { AppShell } from '@/components/AppShell';
import Sidebar from '@/components/Sidebar';
import styles from '@/app/layout.module.css';

export default async function SharedFilePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ p?: string }> }) {
    const { id: linkId } = await params;
    const { p } = await searchParams;
    const details = await getShareLinkDetails(linkId);

    if (!details) {
        notFound();
    }

    if (details.projectId) {
        const supabase = await createClient();
        const { data: userData } = await supabase.auth.getUser();

        if (userData?.user?.email) {
            // Check global admin
            const { data: adminData } = await supabase
                .from('share_whitelist')
                .select('role')
                .eq('email', userData.user.email)
                .single();

            // Check project member
            const { data: memberData } = await supabase
                .from('share_project_members')
                .select('role')
                .eq('project_id', details.projectId)
                .eq('email', userData.user.email)
                .single();

            if (adminData?.role === 'admin' || memberData) {
                // If the user has access to the project, bypass guest view.
                if (details.type === 'folder') {
                    redirect(`/?projectId=${details.projectId}&folderId=${details.nodeId}`);
                } else {
                    // It's a file, redirect to parent folder or route root folder if null
                    const targetFolderId = details.parentId ? `&folderId=${details.parentId}` : '';
                    redirect(`/?projectId=${details.projectId}${targetFolderId}`);
                }
            }
        }
    }

    let initialDownloadUrl: string | null = null;
    let initialError: string | null = null;
    let initialType: 'file' | 'folder' | null = null;
    let initialFolderId: string | null = null;

    // If there is no password, we might be able to fetch the URL right away depending on how we want the UX.
    // Or if they passed a password via URL like /s/[id]?p=1234
    if (!details.requiresPassword) {
        const verifyRes = await verifyShareLink(linkId);
        if (verifyRes.success) {
            initialType = verifyRes.type as 'file' | 'folder';
            if (verifyRes.type === 'file') {
                initialDownloadUrl = verifyRes.downloadUrl || null;
            } else {
                initialFolderId = verifyRes.folderId || null;
            }
        } else {
            initialError = verifyRes.error || null;
        }
    } else if (p) {
        const verifyRes = await verifyShareLink(linkId, p);
        if (verifyRes.success) {
            initialType = verifyRes.type as 'file' | 'folder';
            if (verifyRes.type === 'file') {
                initialDownloadUrl = verifyRes.downloadUrl || null;
            } else {
                initialFolderId = verifyRes.folderId || null;
            }
        } else {
            initialError = verifyRes.error || null;
        }
    }

    const headerContent = (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, minWidth: 0 }}>
            {/* Search Bar Placeholder for Guest */}
            <div className={styles.searchBar}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                    type="text"
                    placeholder="Search across SharePoint..."
                    className={styles.searchInput}
                    readOnly
                />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Sign Out Button Placeholder to match UI 100% */}
                <button className={styles.signOutBtn} style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>Sign Out</span>
                </button>

                <div className={styles.userProfile}>
                    <div className={styles.userInfo} style={{ textAlign: 'right', lineHeight: 1.3 }}>
                        <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Guest User
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--success-text)', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                            <span style={{ display: 'inline-block', width: '6px', height: '6px', background: 'var(--success-text)', borderRadius: '50%', boxShadow: '0 0 8px var(--success-text)' }} />
                            Guest Access
                        </div>
                    </div>
                    <div className={styles.avatar}>GU</div>
                </div>
            </div>
        </div>
    );

    return (
        <AppShell
            sidebar={<Sidebar initialProjects={[{ id: 'guest-root', name: details.fileName || 'Shared Folder', userRole: 'read_only' }]} role="guest" totalUsageBytes={0} />}
            header={headerContent}
        >
            <ClientShareAccess
                linkId={linkId}
                details={details}
                initialDownloadUrl={initialDownloadUrl}
                initialError={initialError}
                initialType={initialType}
                initialFolderId={initialFolderId}
                passedPassword={p}
            />
        </AppShell>
    );
}
