
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
            type,
            projectId, // UUID
            parentId,
            resolution,
            silent
        } = body;
        // Note: We ignore 'size' from body for Security reasons. We fetch it from R2.

        // [Performance] Parallelize Validation & Data Fetching
        // 1. R2 HeadObject (Get Real Size & Verify)
        // 2. Whitelist (For Admin check)
        // 3. Project Data (For Quota/Settings)
        // 4. Latest Node (For Conflict/Overwrite resolution)

        const headObjectPromise = r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
        const whitelistPromise = supabase.from('whitelist').select('role').eq('email', user.email).single();
        const projectPromise = supabase.from('projects')
            .select('id, name, max_storage_bytes, current_storage_bytes, created_by, settings')
            .eq('id', projectId)
            .single();

        let existingNodeQuery = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', projectId)
            .eq('name', filename)
            .eq('type', 'FILE');

        if (parentId && parentId !== 'null') existingNodeQuery = existingNodeQuery.eq('parent_id', parentId);
        else existingNodeQuery = existingNodeQuery.is('parent_id', null);

        const latestNodePromise = existingNodeQuery.order('version', { ascending: false });

        // Wait for all checks
        const [headObjectRes, whitelistRes, projectRes, latestNodeRes] = await Promise.allSettled([
            headObjectPromise,
            whitelistPromise,
            projectPromise,
            latestNodePromise
        ]);

        // Evaluate R2 Result [Security Critical]
        if (headObjectRes.status === 'rejected') {
            return NextResponse.json({ error: 'File verification failed. Not found in storage.' }, { status: 404 });
        }
        const fileSize = headObjectRes.value.ContentLength || 0;

        // Evaluate Project
        if (projectRes.status === 'rejected' || !projectRes.value.data) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projectRes.value.data;

        // Evaluate Others
        const whitelistUser = whitelistRes.status === 'fulfilled' ? whitelistRes.value.data : null;
        const latestNode = (latestNodeRes.status === 'fulfilled' && latestNodeRes.value.data) ? latestNodeRes.value.data[0] : null;

        // Resolution Logic
        let targetVersion = 1;
        let overwriteNodeId = null;

        if (latestNode) {
            if (resolution === 'update') {
                targetVersion = (latestNode.version || 1) + 1;
            } else if (resolution === 'overwrite') {
                const isAdmin = whitelistUser?.role === 'admin';
                const isOwner = latestNode.created_by === user.id || latestNode.owner_email === user.email;

                if (!isAdmin && !isOwner) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
                overwriteNodeId = latestNode.id;
                targetVersion = latestNode.version || 1;
            }
        }

        // Calculate size diff for Quota
        // Note: Logic assumes fileSize is the NEW size.
        const sizeDiff = overwriteNodeId ? (fileSize - (latestNode.size || 0)) : fileSize;

        // [Performance] Post-Processing Async Tasks
        const postProcessTasks = [];

        // 1. Delete old R2 file (if overwrite)
        if (overwriteNodeId && latestNode.r2_key && latestNode.r2_key !== key) {
            postProcessTasks.push(r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: latestNode.r2_key }))
                .catch(e => console.error("Failed to delete old version", e)));
        }

        // 2. DB Update
        let node;
        if (overwriteNodeId) {
            const { data, error } = await supabase.from('storage_nodes').update({
                r2_key: key,
                size: fileSize, // Use Verified Size
                updated_at: new Date().toISOString(),
            }).eq('id', overwriteNodeId).select().single();
            if (error) throw error;
            node = data;
        } else {
            const { data, error } = await supabase.from('storage_nodes').insert({
                name: filename,
                type: 'FILE',
                parent_id: parentId === 'null' ? null : parentId,
                project_id: projectId,
                r2_key: key,
                size: fileSize, // Use Verified Size
                mime_type: type,
                created_by: user.id,
                owner_email: user.email,
                sharing_scope: 'PRIVATE',
                version: targetVersion
            }).select().single();
            if (error) throw error;
            node = data;
        }

        // 3. Update Quota
        // We do this immediately to ensure data consistency, or we can parallelize if we trust loose eventual consistency.
        // Doing it immediately is safer for quota enforcement.
        const { error: rpcError } = await supabase.rpc('increment_project_storage', {
            p_id: projectId,
            amount: sizeDiff
        });
        if (rpcError) {
            // Fallback
            await supabase.from('projects')
                .update({ current_storage_bytes: project.current_storage_bytes + sizeDiff })
                .eq('id', projectId);
        }

        // 4. Version Retention (Background)
        const retentionTask = (async () => {
            const retentionLimit = project.settings?.version_retention_limit;
            if (retentionLimit && retentionLimit > 0) {
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
        })();
        postProcessTasks.push(retentionTask.catch(e => console.error("Retention logic error", e)));

        // 5. Notifications (Background)
        const notificationTask = (async () => {
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

                if (rootFolder?.owner_email) {
                    await sendActivityNotification({
                        to: rootFolder.owner_email,
                        projectName: project.name,
                        userName: user.email || 'Unknown User',
                        action: resolution === 'update' ? 'VERSION_UPDATED' : 'UPLOADED',
                        fileName: filename,
                        timestamp: new Date().toLocaleString()
                    });
                }
            }
        })();
        postProcessTasks.push(notificationTask.catch(e => console.error("Notification Error", e)));

        // 6. Access Log (Background)
        postProcessTasks.push(
            supabase.from('access_logs').insert({
                user_email: user.email,
                action: 'UPLOAD',
                file_key: key,
                details: `Project: ${project.name} (${projectId})`
            }).catch(e => console.error("Logging Error", e))
        );

        // Execute background tasks mostly in parallel but we want to return fast
        // In Serverless, we SHOULD await them. Promise.all is fast enough if tasks are non-blocking.
        await Promise.all(postProcessTasks);

        return NextResponse.json(node);

    } catch (error: any) {
        console.error('Upload Complete Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
