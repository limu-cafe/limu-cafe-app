'use client';

import { useMemo, useState } from 'react';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import ObjectDetailNavigation, { useObjectDetailView } from '@/components/admin/ObjectDetailNavigation';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { normalizeSearchText } from '@/lib/search';

type RequestRow = {
  id: string;
  status: 'pending' | 'completed' | 'rejected';
  legacy_name: string | null;
  note: string | null;
  rejection_reason: string | null;
  created_at: string;
  user?: { name?: string | null; email?: string | null } | null;
  matched_legacy_user?: { name?: string | null } | null;
};

type LegacyUserRow = {
  id: string;
  name: string;
  legacy_balance: number;
  favorite_item_names: string[] | null;
  matched_user_id: string | null;
  transferred_at: string | null;
  purchase_summary: {
    totalQuantity: number;
    topItems: string[];
  };
};

export default function LegacyTransferClient({
  requests,
  legacyUsers,
}: {
  requests: RequestRow[];
  legacyUsers: LegacyUserRow[];
}) {
  const router = useRouter();
  const [view,setView]=useObjectDetailView(['requests','archive']);
  const [requestId,selectRequest]=useObjectSelection('request');
  const selected=requests.find(request=>request.id===requestId);
  const [selectedLegacyUser, setSelectedLegacyUser] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const unmatchedLegacyUsers = useMemo(
    () => legacyUsers.filter((legacyUser) => !legacyUser.matched_user_id && !legacyUser.transferred_at),
    [legacyUsers]
  );

  const pendingRequests = requests.filter((request) => request.status === 'pending');
  const handledRequests = requests.filter((request) => request.status !== 'pending');

  const suggestionsByRequest = useMemo(() => {
    const scoreLegacyUser = (request: RequestRow, legacyUser: LegacyUserRow) => {
      const targets = [
        request.legacy_name ?? '',
        request.user?.name ?? '',
        request.user?.email ?? '',
      ]
        .map((value) => normalizeSearchText(value))
        .filter(Boolean);

      const candidate = normalizeSearchText(legacyUser.name);
      let score = 0;

      for (const target of targets) {
        if (candidate === target) score += 100;
        else if (candidate.includes(target) || target.includes(candidate)) score += 60;
        else if (candidate[0] && target[0] && candidate[0] === target[0]) score += 15;
      }

      score += Math.min(legacyUser.purchase_summary.totalQuantity, 20);
      return score;
    };

    return Object.fromEntries(
      pendingRequests.map((request) => [
        request.id,
        unmatchedLegacyUsers
          .map((legacyUser) => ({ legacyUser, score: scoreLegacyUser(request, legacyUser) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5),
      ])
    );
  }, [pendingRequests, unmatchedLegacyUsers]);

  const handleApprove = async (requestId: string) => {
    const legacyUserId = selectedLegacyUser[requestId];
    if (!legacyUserId) {
      toast.error('旧システムユーザーを選択してください');
      return;
    }

    setLoading(requestId + 'approve');
    try {
      const res = await fetch(`/api/admin/legacy-transfer/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacy_user_id: legacyUserId }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error ?? '引き継ぎに失敗しました');
      }

      toast.success('旧データを引き継ぎました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setLoading(requestId + 'reject');
    try {
      const res = await fetch(`/api/admin/legacy-transfer/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: rejectReason[requestId] ?? '' }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error ?? '却下に失敗しました');
      }

      toast.success('申請を却下しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  return <div className="mx-auto max-w-5xl space-y-5"><header><h1 className="text-2xl font-bold text-white">旧データ移行</h1><p className="mt-1 text-sm text-gray-400">申請 {pendingRequests.length}件 · 未引き継ぎ {unmatchedLegacyUsers.length}人 · 完了 {handledRequests.filter(request=>request.status==='completed').length}件</p></header><ObjectDetailNavigation value={view} onChange={setView} options={[{id:'requests',label:'移行申請'},{id:'archive',label:'旧利用者データ'}]}/>
    {view==='requests'&&<ObjectWorkspace selected={Boolean(selected)} label="移行申請の詳細" onClose={()=>selectRequest(null)} collection={<div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">{requests.map(request=><button key={request.id} type="button" aria-pressed={request.id===requestId} onClick={()=>selectRequest(request.id)} className="block w-full px-4 py-4 text-left"><span className="text-sm text-white">{request.user?.name??request.legacy_name??'移行申請'}</span><small className="mt-1 block text-gray-400">{request.legacy_name} · {request.status==='pending'?'申請中':request.status==='completed'?'移行完了':'却下'}</small></button>)}{!requests.length&&<p className="p-6 text-sm text-gray-400">移行申請はありません</p>}</div>} detail={selected&&(()=>{const request=selected;return request.status==='pending'?            <div key={request.id} className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{request.user?.name}</p>
                  <p className="text-sm text-gray-400">{request.user?.email ?? 'メール未設定'}</p>
                  {request.legacy_name && (
                    <p className="mt-2 text-sm text-amber-300">旧システム名: {request.legacy_name}</p>
                  )}
                  {request.note && (
                    <p className="mt-2 text-sm text-gray-300">{request.note}</p>
                  )}
                </div>
                <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-300">
                  申請中
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">紐づける旧システムユーザー</label>
                  <select
                    aria-label="紐づける旧システムユーザー" value={selectedLegacyUser[request.id] ?? ''}
                    onChange={(event) =>
                      setSelectedLegacyUser((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:outline-hidden"
                  >
                    <option value="">選択してください</option>
                    {unmatchedLegacyUsers.map((legacyUser) => (
                      <option key={legacyUser.id} value={legacyUser.id}>
                        {legacyUser.name} / 残高 {legacyUser.legacy_balance} / 購入 {legacyUser.purchase_summary.totalQuantity}点
                      </option>
                    ))}
                  </select>

                  {(suggestionsByRequest[request.id] ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(suggestionsByRequest[request.id] ?? []).map(({ legacyUser, score }) => (
                        <button
                          key={legacyUser.id}
                          type="button"
                          onClick={() =>
                            setSelectedLegacyUser((current) => ({
                              ...current,
                              [request.id]: legacyUser.id,
                            }))
                          }
                          className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/25"
                        >
                          候補: {legacyUser.name} ({score})
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedLegacyUser[request.id] && (
                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-300">
                      {(() => {
                        const legacyUser = unmatchedLegacyUsers.find(
                          (candidate) => candidate.id === selectedLegacyUser[request.id]
                        );
                        if (!legacyUser) return null;
                        return (
                          <>
                            <p>残高: {legacyUser.legacy_balance >= 0 ? `+¥${legacyUser.legacy_balance.toLocaleString()}` : `後払い ¥${Math.abs(legacyUser.legacy_balance).toLocaleString()}`}</p>
                            <p className="mt-1">
                              お気に入り: {(legacyUser.favorite_item_names ?? []).length}件
                            </p>
                            <p className="mt-1">
                              よく買っていた商品: {legacyUser.purchase_summary.topItems.join('、') || '記録なし'}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-400">却下理由（任意）</label>
                  <textarea
                    aria-label="却下理由（任意）" value={rejectReason[request.id] ?? ''}
                    onChange={(event) =>
                      setRejectReason((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    rows={4}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => handleReject(request.id)}
                  disabled={loading !== null}
                  className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                >
                  {loading === request.id + 'reject' ? '却下中...' : '却下'}
                </button>
                <button
                  onClick={() => handleApprove(request.id)}
                  disabled={loading !== null}
                  className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {loading === request.id + 'approve' ? '引き継ぎ中...' : '引き継いで完了'}
                </button>
              </div>
            </div>:<section><h2 className="font-bold text-white">{request.user?.name??'移行申請'}</h2><p className="mt-3 text-sm text-gray-400">{request.status==='completed'?'引き継ぎ完了':'却下'}</p><p className="mt-3 text-sm text-gray-300">旧システム名：{request.matched_legacy_user?.name??request.legacy_name}</p><p className="mt-3 text-sm text-gray-300">{request.rejection_reason??request.note}</p></section>;})()}/>}
    {view==='archive'&&<div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">旧データ一覧</h2>
        <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['名前', '残高', 'お気に入り', '購入数', '状態'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {legacyUsers.map((legacyUser) => (
                <tr key={legacyUser.id} className="border-b border-gray-800/50">
                  <td className="px-4 py-3 text-white">{legacyUser.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-300">
                    {legacyUser.legacy_balance >= 0
                      ? `+¥${legacyUser.legacy_balance.toLocaleString()}`
                      : `-¥${Math.abs(legacyUser.legacy_balance).toLocaleString()}`}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {(legacyUser.favorite_item_names ?? []).length}件
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {legacyUser.purchase_summary.totalQuantity}点
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        legacyUser.transferred_at
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      {legacyUser.transferred_at ? '引き継ぎ済み' : '未引き継ぎ'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
  </div>;
}
