'use client';

import { useState } from 'react';
import { CheckCircle, Download } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

export default function SettlementClient({ users, history }: { users: any[]; history: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [method, setMethod] = useState<Record<string, string>>({});

  const totalDeferred = users.reduce((s, u) => s + u.deferred_balance, 0);

  const handleSettle = async (userId: string, amount: number) => {
    setLoading(userId);
    try {
      const res = await fetch('/api/admin/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          amount,
          method: method[userId] ?? 'cash',
          period_start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
          period_end: format(new Date(), 'yyyy-MM-dd'),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('精算を完了しました');
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const exportCSV = () => {
    const header = 'ユーザー名,後払い残高\n';
    const rows = users.map(u => `${u.name},${u.deferred_balance}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `limu-settlement-${format(new Date(), 'yyyyMM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSVをダウンロードしました');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">精算管理</h1>
          <p className="text-gray-400 text-sm mt-1">
            後払い合計:
            <span className="text-amber-400 font-mono font-bold ml-1">
              ¥{totalDeferred.toLocaleString()}
            </span>
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-lg text-sm transition-colors"
        >
          <Download size={16} />
          CSV出力
        </button>
      </div>

      {/* 未精算ユーザー */}
      {users.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">✓</p>
          <p>未精算の後払いはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">未精算一覧</h2>
          {users.map((user) => (
            <div key={user.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
              {user.avatar_url ? (
                <img src={user.avatar_url} className="w-10 h-10 rounded-full flex-shrink-0" alt="" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 flex-shrink-0">
                  {user.name?.[0]}
                </div>
              )}
              <div className="flex-1">
                <p className="text-white font-medium">{user.name}</p>
              </div>
              <div className="text-right mr-4">
                <p className="font-display font-bold text-2xl text-amber-400">
                  ¥{user.deferred_balance.toLocaleString()}
                </p>
              </div>
              {/* 支払い方法 */}
              <select
                value={method[user.id] ?? 'cash'}
                onChange={(e) => setMethod({ ...method, [user.id]: e.target.value })}
                className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value="cash">現金</option>
                <option value="stripe">クレカ</option>
                <option value="balance">残高から</option>
              </select>
              <button
                onClick={() => handleSettle(user.id, user.deferred_balance)}
                disabled={!!loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              >
                {loading === user.id ? (
                  <span className="animate-spin w-4 h-4 border border-green-400 border-t-transparent rounded-full" />
                ) : (
                  <CheckCircle size={16} />
                )}
                精算完了
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 精算履歴 */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">精算履歴</h2>
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['ユーザー', '金額', '方法', '対象期間', '日時'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-3 text-gray-300">{h.user?.name}</td>
                    <td className="px-4 py-3 font-mono text-white">¥{h.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {h.method === 'cash' ? '現金' : h.method === 'stripe' ? 'クレカ' : '残高'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {format(new Date(h.period_start), 'M/d', { locale: ja })} - {format(new Date(h.period_end), 'M/d', { locale: ja })}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {format(new Date(h.created_at), 'M/d HH:mm', { locale: ja })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
