import { getAdminOverview } from '@/lib/admin-queries';
import { requireAdminSession } from '@/lib/admin-session';
import AdminSidebar from './AdminSidebar';

export default async function AdminSidebarData() {
  try {
    const access = await requireAdminSession();
    if (!access.user) return <AdminSidebar />;
    const overview = await getAdminOverview();
    return <AdminSidebar notifications={overview.notifications} />;
  } catch (error) {
    console.error('failed to load admin summary', error);
    return <AdminSidebar status="error" />;
  }
}
