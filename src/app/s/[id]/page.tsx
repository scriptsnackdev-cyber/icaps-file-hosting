import { getShareLinkDetails, verifyShareLink } from '@/app/actions';
import { notFound } from 'next/navigation';
import ClientShareAccess from './ClientShareAccess';

export default async function SharedFilePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ p?: string }> }) {
    const { id: linkId } = await params;
    const { p } = await searchParams;
    const details = await getShareLinkDetails(linkId);

    if (!details) {
        notFound();
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

    return (
        <ClientShareAccess
            linkId={linkId}
            details={details}
            initialDownloadUrl={initialDownloadUrl}
            initialError={initialError}
            initialType={initialType}
            initialFolderId={initialFolderId}
            passedPassword={p}
        />
    );
}
