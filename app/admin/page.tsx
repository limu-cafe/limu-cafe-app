import {requireAdminPage} from '@/lib/admin-page-session';
import {getAdminOverview} from '@/lib/admin-queries';
import AdminDashboardView from '@/components/admin/AdminDashboardView';
export const dynamic='force-dynamic';
export default async function AdminDashboard(){await requireAdminPage();const overview=await getAdminOverview();return AdminDashboardView({overview});}
