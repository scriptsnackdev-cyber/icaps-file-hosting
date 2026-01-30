
import { NextRequest, NextResponse } from 'next/server';
import { HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';
import { sendActivityNotification } from '@/lib/resend';

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            key,
            filename,
            size,
            type,
            projectId, // UUID
            parentId,
            resolution,
            silent
        } = body;

        // 1. Verify existence in R2 (Sanity Check)
        try {
            await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
        } catch (e) {
            return NextResponse.json({ error: 'File verification failed. Not found in storage.' }, { status: 404 });
        }

        // Re-resolve latest node for overwrite/update logic to ensure DB consistency
        let existingNodeQuery = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', projectId)
            .eq('name', filename)
            .eq('type', 'FILE');

        if (parentId && parentId !== 'null') existingNodeQuery = existingNodeQuery.eq('parent_id', parentId);
        else existingNodeQuery = existingNodeQuery.is('parent_id', null);

        const { data: existingNodes } = await existingNodeQuery.order('version', { ascending: false });
        const latestNode = existingNodes?.[0];

        let targetVersion = 1;
        let overwriteNodeId = null;

        if (latestNode) {
            if (resolution === 'update') {
                targetVersion = (latestNode.version || 1) + 1;
            } else if (resolution === 'overwrite') {
                // Permission Check (Double check)
                const { data: whitelistUser } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
                const isAdmin = whitelistUser?.role === 'admin';
                const isOwner = latestNode.created_by === user.id || latestNode.owner_email === user.email;

                if (!isAdmin && !isOwner) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
                overwriteNodeId = latestNode.id;
                targetVersion = latestNode.version || 1;
            }
        }

        // Fetch Project
        const { data: project, error: projError } = await supabase
            .from('projects')
            .select('id, name, max_storage_bytes, current_storage_bytes, created_by, settings')
            .eq('id', projectId)
            .single();

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Calculate size diff
        const sizeDiff = overwriteNodeId ? (size - (latestNode.size || 0)) : size;

        // Delete old physical file if overwriting
        if (overwriteNodeId && latestNode.r2_key && latestNode.r2_key !== key) {
            try {
                await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: latestNode.r2_key }));
            } catch (e) {
                console.error("Failed to delete old version during overwrite", e);
            }
        }

        // DB Update/Insert
        let node;
        let dbError;

        if (overwriteNodeId) {
            const { data, error } = await supabase.from('storage_nodes').update({
                r2_key: key,
                size: size,
                updated_at: new Date().toISOString(),
            }).eq('id', overwriteNodeId).select().single();
            node = data;
            dbError = error;
        } else {
            const { data, error } = await supabase.from('storage_nodes').insert({
                name: filename,
                type: 'FILE',
                parent_id: parentId === 'null' ? null : parentId,
                project_id: projectId,
                r2_key: key,
                size: size,
                mime_type: type,
                created_by: user.id,
                owner_email: user.email,
                sharing_scope: 'PRIVATE',
                version: targetVersion
            }).select().single();
            node = data;
            dbError = error;
        }

        if (dbError) throw dbError;

        // Update Quota
        const { error: rpcError } = await supabase.rpc('increment_project_storage', {
            p_id: projectId,
            amount: sizeDiff
        });
        if (rpcError) {
            await supabase.from('projects')
                .update({ current_storage_bytes: project.current_storage_bytes + sizeDiff })
                .eq('id', projectId);
        }

        // Version Retention
        try {
            const retentionLimit = project.settings?.version_retention_limit;
            if (retentionLimit && retentionLimit > 0) {
                // Fetch all versions
                let vQuery = supabase.from('storage_nodes')
                    .select('*')
                    .eq('project_id', project.id)
                    .eq('name', filename)
                    .eq('type', 'FILE')
                    .order('version', { ascending: false });

                if (parentId && parentId !== 'null') vQuery = vQuery.eq('parent_id', parentId);
                else vQuery = vQuery.is('parent_id', null);

                const { data: allVersions } = await vQuery;

                if (allVersions && allVersions.length > retentionLimit) {
                    const toPurge = allVersions.slice(retentionLimit);
                    let spaceFreed = 0;

                    for (const v of toPurge) {
                        if (v.r2_key) {
                            try {
                                await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: v.r2_key }));
                            } catch (e) { console.error(`Failed to purge v${v.version}`, e); }

                            spaceFreed += (v.size || 0);
                            await supabase.from('storage_nodes').update({ r2_key: null, size: 0 }).eq('id', v.id);
                        }
                    }
                    if (spaceFreed > 0) {
                        await supabase.rpc('update_project_storage', { project_id: project.id, size_delta: -spaceFreed });
                    }
                }
            }
        } catch (e) {
            console.error("Version retention failed", e);
        }

        // Email Notification
        try {
            const isOwner = project.created_by === user.id;
            const settings = project.settings || {};

            if (!silent && !isOwner && settings.notify_on_activity) {
                const { data: rootFolder } = await supabase
                    .from('storage_nodes')
                    .select('owner_email')
                    .eq('project_id', project.id)
                    .is('parent_id', null)
                    .limit(1)
                    .single();

                const ownerEmail = rootFolder?.owner_email;

                if (ownerEmail) {
                    await sendActivityNotification({
                        to: ownerEmail,
                        projectName: project.name,
                        userName: user.email || 'Unknown User',
                        action: resolution === 'update' ? 'VERSION_UPDATED' : 'UPLOADED',
                        fileName: filename,
                        timestamp: new Date().toLocaleString()
                    });
                }
            }
        } catch (e) {
            console.error("Notification failed", e);
        }

        // Log
        await supabase.from('access_logs').insert({
            user_email: user.email,
            action: 'UPLOAD',
            file_key: key,
            details: `Project: ${project.name} (${projectId})`
        });

        return NextResponse.json(node);

    } catch (error: any) {
        console.error('Upload Complete Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
