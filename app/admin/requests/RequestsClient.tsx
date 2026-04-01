'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, XCircle, PackagePlus } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '検討中', approved: '採用', rejected: '却下',
};

export default function RequestsClient({ requests }: { requests: any[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === '1');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    setLoading(id + status);
    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_note: adminNote[id] ?? '' }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(status === 'approved' ? '採用しました' : '却下しました');
      setOpenNote(null);
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const pending = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const done = useMemo(() => requests.filter(r => r.status !== 'pending'), [requests]);
  const visibleDone = pendingOnly ? [] : done;

  const handleToggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const handleToggleAllPending = () => {
    setSelectedIds((current) =>
      current.length === pending.length ? [] : pending.map((request) => request.id)
    );
  };

  const handleBatchAction = async (status: 'approved' | 'rejected') => {
    if (selectedIds.length === 0) {
      toast.error('対象を選択してください');
      return;
    }

    setLoading(`batch-${status}`);
    try {
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/requests/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, admin_note: '' }),
        });
        if (!res.ok) {
          throw new Error((await res.json()).error ?? '一括処理に失敗しました');
        }
      }
      toast.success(`${selectedIds.length}件を${status === 'approved' ? '採用' : '却下'}しました`);
      setSelectedIds([]);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">商品要望管理</h1>
        <p className="text-gray-400 text-sm mt-1">検討中: {pending.length}件</p>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={pendingOnly}
          onChange={(e) => setPendingOnly(e.target.checked)}
          className="rounded border-gray-700 bg-gray-900 text-white"
        />
        未対応だけ表示
      </label>

      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={pending.length > 0 && selectedIds.length === pending.length}
              onChange={handleToggleAllPending}
              className="rounded border-gray-700 bg-gray-900 text-white"
            />
            すべて選択
          </label>
          <span className="text-sm text-gray-400">選択中: {selectedIds.length}件</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleBatchAction('rejected')}
              disabled={!!loading || selectedIds.length === 0}
              className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-300 disabled:opacity-50"
            >
              一括却下
            </button>
            <button
              onClick={() => handleBatchAction('approved')}
              disabled={!!loading || selectedIds.length === 0}
              className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-300 disabled:opacity-50"
            >
              一括採用
            </button>
          </div>
        </div>
      )}

      {pending.length === 0 && visibleDone.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">📭</p>
          <p>要望がありません</p>
        </div>
      )}

      {/* 検討中 */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">検討中</h2>
          {pending.map((req) => (
            <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(req.id)}
                    onChange={() => handleToggleSelection(req.id)}
                    className="rounded border-gray-700 bg-gray-900 text-white"
                  />
                  {req.user?.avatar_url ? (
                    <img src={req.user.avatar_url} className="w-7 h-7 rounded-full" alt="" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {req.user?.name?.[0]}
                    </div>
                  )}
                  <div>
                    <p className="text-white font-medium">{req.item_name}</p>
                    <p className="text-gray-500 text-xs">{req.user?.name} · {format(new Date(req.created_at), 'M/d', { locale: ja })}</p>
                  </div>
                </div>
                {req.desired_price && (
                  <span className="text-amber-400 font-mono text-sm flex-shrink-0">
                    希望 ¥{req.desired_price.toLocaleString()}
                  </span>
                )}
              </div>

              {req.reason && (
                <p className="text-gray-300 text-sm bg-gray-800 rounded-lg px-3 py-2">{req.reason}</p>
              )}

              {/* 管理者コメント入力 */}
              {openNote === req.id && (
                <textarea
                  value={adminNote[req.id] ?? ''}
                  onChange={(e) => setAdminNote({ ...adminNote, [req.id]: e.target.value })}
                  placeholder="コメント（任意）"
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpenNote(openNote === req.id ? null : req.id)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {openNote === req.id ? 'コメントを閉じる' : 'コメントを追加'}
                </button>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => handleAction(req.id, 'rejected')}
                    disabled={!!loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors disabled:opacity-40"
                  >
                    <XCircle size={15} /> 却下
                  </button>
                  <button
                    onClick={() => handleAction(req.id, 'approved')}
                    disabled={!!loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm transition-colors disabled:opacity-40"
                  >
                    <CheckCircle size={15} /> 採用
                  </button>
                  <a
                    href={`/admin/items?prefill=${encodeURIComponent(req.item_name)}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-sm transition-colors"
                  >
                    <PackagePlus size={15} /> 商品登録へ
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 処理済み */}
      {visibleDone.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">処理済み</h2>
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['商品名', '申請者', '希望価格', 'ステータス', '日時'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-400 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDone.map((req) => (
                  <tr key={req.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-3 text-white">{req.item_name}</td>
                    <td className="px-4 py-3 text-gray-400">{req.user?.name}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {req.desired_price ? `¥${req.desired_price.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[req.status]}`}>
                        {STATUS_LABEL[req.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {format(new Date(req.created_at), 'M/d', { locale: ja })}
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
