import FileManager from '@/components/FileManager';
import ProjectDashboard from '@/components/ProjectDashboard';
import { fetchUserProjectsWithUsage } from '@/app/actions';
import { Suspense } from 'react';

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

  // Otherwise fetch projects with usage and render the dashboard
  const projects = await fetchUserProjectsWithUsage();

  return (
    <Suspense fallback={<div style={{ padding: '24px' }}>Loading projects...</div>}>
      <ProjectDashboard projects={projects} />
    </Suspense>
  );
}
