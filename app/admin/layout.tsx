import { Suspense } from 'react';
import AdminShell from './AdminShell';
import AdminSidebar from './AdminSidebar';
import AdminSidebarData from './AdminSidebarData';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell sidebar={<Suspense fallback={<AdminSidebar status="loading" />}><AdminSidebarData /></Suspense>}>
      {children}
  </AdminShell>;
}
