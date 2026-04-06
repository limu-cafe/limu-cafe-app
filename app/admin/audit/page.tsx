import { createAdminClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const supabase = createAdminClient();
  const { data: logs } = await supabase
    .from('admin_audit_logs')
    .select('*, actor:users!admin_audit_logs_actor_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">監査ログ</h1>
        <p className="mt-1 text-sm text-gray-400">
          承認・精算・金庫調整などの管理者操作を時系列で確認できます
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['日時', '担当者', '操作', '対象', '内容'].map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((log: any) => (
              <tr key={log.id} className="border-b border-gray-800/50">
                <td className="px-4 py-3 text-xs text-gray-400">
                  {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm', { locale: ja })}
                </td>
                <td className="px-4 py-3 text-gray-300">{log.actor?.name ?? '不明'}</td>
                <td className="px-4 py-3 text-white">{log.action_type}</td>
                <td className="px-4 py-3 text-gray-400">
                  {log.target_type}
                  {log.target_id ? ` / ${log.target_id}` : ''}
                </td>
                <td className="px-4 py-3 text-gray-300">{log.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
