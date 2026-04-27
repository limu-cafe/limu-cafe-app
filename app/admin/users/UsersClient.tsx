'use client';

import { useState } from 'react';
import { CheckCircle, UserMinus, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@/types';

export default function UsersClient({ users }: { users: User[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [addBalanceUserId, setAddBalanceUserId] = useState<string | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === '1');

  const pending = users.filter(u => !u.is_approved && u.is_active);
  const active = users.filter(u => u.is_approved && u.is_active);
  const inactive = users.filter(u => !u.is_active);
  const visibleActive = pendingOnly ? [] : active;
  const visibleInactive = pendingOnly ? [] : inactive;

  const handleApprove = async (userId: string) => {
    setLoading(userId + 'approve');
    try {
      const res = await fetch(`/api/admin/users/${userId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('承認しました');
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const handleDeactivate = async (userId: string, name: string) => {
    if (!confirm(`${name} を無効化しますか？（退会・卒業処理）`)) return;
    setLoading(userId + 'deactivate');
    try {
      const res = await fetch(`/api/admin/users/${userId}/deactivate`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('無効化しました');
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const handleAddBalance = async (userId: string) => {
    if (!balanceAmount || Number(balanceAmount) <= 0) { toast.error('金額を入力してください'); return; }
    setLoading(userId + 'balance');
    try {
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(balanceAmount) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`¥${Number(balanceAmount).toLocaleString()} を追加しました`);
      setAddBalanceUserId(null);
      setBalanceAmount('');
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const UserRow = ({ user }: { user: User }) => (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {user.avatar_url ? (
            <img src={user.avatar_url} className="w-7 h-7 rounded-full" alt="" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
              {user.name?.[0]}
            </div>
          )}
          <span className="text-white">{user.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-400 text-sm">{user.email ?? '-'}</td>
      <td className="px-4 py-3 font-mono text-green-400">¥{user.balance.toLocaleString()}</td>
      <td className="px-4 py-3 font-mono text-amber-400">
        {user.deferred_balance > 0 ? `¥${user.deferred_balance.toLocaleString()}` : '-'}
      </td>
      <td className="px-4 py-3 font-mono text-sky-300">
        {user.points_balance.toLocaleString()}pt
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs">
        {format(new Date(user.created_at), 'yyyy/M/d', { locale: ja })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/points?user=${user.id}`}
            className="rounded-lg px-2 py-1 text-xs text-sky-300 transition-colors hover:bg-sky-500/15"
            title="ポイントを調整"
          >
            pt
          </Link>
          {/* 残高追加 */}
          {addBalanceUserId === user.id ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                placeholder="金額"
                className="w-20 bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 text-xs font-mono"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAddBalance(user.id)}
              />
              <button
                onClick={() => handleAddBalance(user.id)}
                disabled={!!loading}
                className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30"
              >確定</button>
              <button
                onClick={() => { setAddBalanceUserId(null); setBalanceAmount(''); }}
                className="px-2 py-1 bg-gray-700 text-gray-400 rounded text-xs hover:bg-gray-600"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddBalanceUserId(user.id)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-green-400 transition-colors"
              title="残高を追加"
            >
              <Plus size={14} />
            </button>
          )}
          {/* 無効化 */}
          {user.is_active && (
            <button
              onClick={() => handleDeactivate(user.id, user.name)}
              disabled={!!loading}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-300 transition-colors hover:bg-red-500/20 hover:text-red-300"
              title="無効化（退会・卒業処理）"
            >
              <UserMinus size={14} />
              無効化
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">ユーザー管理</h1>
        <p className="text-gray-400 text-sm mt-1">メンバー {active.length}人</p>
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

      {/* 承認待ち */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-amber-400 uppercase tracking-wider flex items-center gap-2">
            ⏳ 承認待ち ({pending.length}人)
          </h2>
          {pending.map((user) => (
            <div key={user.id} className="bg-gray-900 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              {user.avatar_url ? (
                <img src={user.avatar_url} className="w-10 h-10 rounded-full" alt="" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300">
                  {user.name?.[0]}
                </div>
              )}
              <div className="flex-1">
                <p className="text-white font-medium">{user.name}</p>
                <p className="text-gray-400 text-sm">{user.email ?? 'メールなし'}</p>
              </div>
              <button
                onClick={() => handleApprove(user.id)}
                disabled={!!loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors"
              >
                {loading === user.id + 'approve' ? (
                  <span className="animate-spin w-4 h-4 border border-green-400 border-t-transparent rounded-full" />
                ) : (
                  <CheckCircle size={16} />
                )}
                承認する
              </button>
            </div>
          ))}
        </div>
      )}

      {/* アクティブユーザー */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-400">メンバー一覧</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['名前', 'メール', '残高', '後払い', 'ポイント', '登録日', '操作'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleActive.map(user => <UserRow key={user.id} user={user} />)}
          </tbody>
        </table>
        {visibleActive.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">メンバーがいません</div>
        )}
      </div>

      {!pendingOnly && visibleInactive.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-400">無効化済みユーザー</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['名前', 'メール', '残高', '後払い', 'ポイント', '登録日', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleInactive.map(user => <UserRow key={user.id} user={user} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
