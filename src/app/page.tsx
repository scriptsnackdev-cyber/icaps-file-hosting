import FileManager from '@/components/FileManager';
import { Suspense } from 'react';

export default function Home() {
  return (
    <Suspense fallback={<div style={{ padding: '24px' }}>Loading workspace...</div>}>
      <FileManager />
    </Suspense>
  );
}
