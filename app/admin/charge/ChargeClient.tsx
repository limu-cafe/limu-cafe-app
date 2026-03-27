'use client';

import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '申請中', approved: '承認済み', rejected: '却下', cancelled: 'キャンセル',
};

export default function ChargeClient({ requests }: { requests: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setLoading(id + action);
    try {
      const res = await fetch(`/api/admin/charge/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(action === 'approve' ? '承認しました' : '却下しました');
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const done = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">チャージ承認</h1>
        <p className="text-gray-400 text-sm mt-1">
          承認待ち: <span className="text-amber-400 font-medium">{pending.length}件</span>
        </p>
      </div>

      {/* 承認待ち */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">承認待ち</h2>
          {pending.map((req) => (
            <div key={req.id} className="bg-gray-900 border border-amber-500/30 rounded-2xl p-5 flex items-center gap-4">
              {req.user?.avatar_url ? (
                <img src={req.user.avatar_url} className="w-10 h-10 rounded-full flex-shrink-0" alt="" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 flex-shrink-0">
                  {req.user?.name?.[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">{req.user?.name}</p>
                <p className="text-gray-400 text-sm">
                  現在の残高: <span className="font-mono">¥{req.user?.balance?.toLocaleString() ?? 0}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(req.created_at), 'M月d日 HH:mm', { locale: ja })} ·
                  {req.method === 'cash' ? ' 現金' : ' クレカ'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-display font-bold text-2xl text-white">
                  +¥{req.amount.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleAction(req.id, 'reject')}
                  disabled={!!loading}
                  className="p-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-40"
                  title="却下"
                >
                  <XCircle size={20} />
                </button>
                <button
                  onClick={() => handleAction(req.id, 'approve')}
                  disabled={!!loading}
                  className="p-2.5 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-40"
                  title="承認"
                >
                  {loading === req.id + 'approve' ? (
                    <span className="animate-spin w-5 h-5 border border-green-400 border-t-transparent rounded-full block" />
                  ) : (
                    <CheckCircle size={20} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 処理済み */}
      {done.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">処理済み</h2>
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['ユーザー', '金額', '方法', 'ステータス', '日時'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {done.map((req) => (
                  <tr key={req.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-3 text-gray-300">{req.user?.name}</td>
                    <td className="px-4 py-3 font-mono text-white">¥{req.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-400">{req.method === 'cash' ? '現金' : 'クレカ'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[req.status]}`}>
                        {STATUS_LABEL[req.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {format(new Date(req.created_at), 'M/d HH:mm', { locale: ja })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {requests.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">✓</p>
          <p>チャージ申請はありません</p>
        </div>
      )}
    </div>
  );
}
