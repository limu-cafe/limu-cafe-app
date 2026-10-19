import AuditRecords from '@/components/admin/AuditRecords';
import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  await requireAdminPage();
  const supabase = createAdminClient();
  const { data: logs } = await supabase
    .from('admin_audit_logs')
    .select('*, actor:users!admin_audit_logs_actor_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  return <AuditRecords logs={logs??[]}/>;
}
