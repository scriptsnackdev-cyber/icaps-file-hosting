import FileManager from '@/components/FileManager';
import ProjectDashboard from '@/components/ProjectDashboard';
import { fetchUserProjectsWithUsage } from '@/actions/project';
import { Suspense } from 'react';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { hasValidSupabaseEnv } from '@/lib/supabase';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const projectId = params?.projectId as string | undefined;
  const folderId = params?.folderId as string | undefined;
  const search = params?.search as string | undefined;
  const recent = params?.recent as string | undefined;

  // If the user navigated into a project / folder / search / recent → show FileManager
  const isInsideProject = !!(projectId || folderId || search || recent);

  if (isInsideProject) {
    return (
      <Suspense fallback={<div style={{ padding: '24px' }}>Loading workspace...</div>}>
        <FileManager />
      </Suspense>
    );
  }

  // Determine user role
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = 'user';

  if (user?.email && hasValidSupabaseEnv) {
    const serviceClient = createServiceClient();
    const { data: roleData } = await serviceClient
      .from('share_whitelist')
      .select('role')
      .ilike('email', user.email)
      .maybeSingle();
    if (roleData) userRole = roleData.role;
  } else if (!hasValidSupabaseEnv) {
    userRole = 'admin';
  }

  // Otherwise fetch projects with usage and render the dashboard
  const projects = await fetchUserProjectsWithUsage();

  return (
    <Suspense fallback={<div style={{ padding: '24px' }}>Loading projects...</div>}>
      <ProjectDashboard projects={projects} userRole={userRole} />
    </Suspense>
  );
}
