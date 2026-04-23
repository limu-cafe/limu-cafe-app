'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PointCampaign, PointSettings, PointTransaction, User } from '@/types';
import { formatPointRule, getActivePointCampaign, getCurrentPointMultiplier, POINT_REASON_LABELS } from '@/lib/points';

type UserOption = Pick<User, 'id' | 'name' | 'email' | 'points_balance'>;

export default function PointsClient({
  settings,
  campaigns,
  users,
  transactions,
}: {
  settings: PointSettings;
  campaigns: PointCampaign[];
  users: UserOption[];
  transactions: Array<PointTransaction & { user?: { name?: string } | null }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUserId = searchParams.get('user') ?? users[0]?.id ?? '';
  const [settingsForm, setSettingsForm] = useState({
    is_enabled: settings.is_enabled,
    base_points_per_unit: settings.base_points_per_unit,
    yen_per_point_unit: settings.yen_per_point_unit,
  });
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    multiplier: 2,
    starts_at: '',
    ends_at: '',
    is_enabled: true,
    apply_immediately: false,
    note: '',
  });
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [manualDelta, setManualDelta] = useState(10);
  const [manualNote, setManualNote] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const activeCampaign = getActivePointCampaign(campaigns);
  const currentMultiplier = getCurrentPointMultiplier(campaigns);
  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(keyword) ||
        (user.email ?? '').toLowerCase().includes(keyword)
    );
  }, [search, users]);

  const selectedUser =
    filteredUsers.find((user) => user.id === selectedUserId) ??
    users.find((user) => user.id === selectedUserId) ??
    null;

  const saveSettings = async () => {
    setLoading('settings');
    try {
      const res = await fetch('/api/admin/points/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      toast.success('ポイント付与設定を保存しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const submitManualDelta = async () => {
    if (!selectedUserId) {
      toast.error('対象ユーザーを選択してください');
      return;
    }
    if (!manualNote.trim()) {
      toast.error('理由メモを入力してください');
      return;
    }

    setLoading('manual');
    try {
      const res = await fetch('/api/admin/points/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUserId,
          delta: manualDelta,
          note: manualNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      toast.success('ポイントを更新しました');
      setManualNote('');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const createCampaign = async () => {
    setLoading('campaign-create');
    try {
      const res = await fetch('/api/admin/points/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      toast.success('キャンペーンを追加しました');
      setCampaignForm({
        name: '',
        multiplier: 2,
        starts_at: '',
        ends_at: '',
        is_enabled: true,
        apply_immediately: false,
        note: '',
      });
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const updateCampaign = async (campaignId: string, patch: Record<string, unknown>) => {
    setLoading(`campaign-${campaignId}`);
    try {
      const res = await fetch(`/api/admin/points/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      toast.success('キャンペーンを更新しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    setLoading(`campaign-delete-${campaignId}`);
    try {
      const res = await fetch(`/api/admin/points/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      toast.success('キャンペーンを削除しました');
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
        <h1 className="font-display font-bold text-2xl text-white">ポイント管理</h1>
        <p className="mt-1 text-sm text-gray-400">
          チャージ特典の付与率、キャンペーン、手動付与/減算をここでまとめて管理できます。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard label="基本付与率" value={formatPointRule(settingsForm)} />
        <MetricCard
          label="現在の倍率"
          value={`${currentMultiplier.toFixed(2).replace(/\.00$/, '')}x`}
          hint={activeCampaign ? activeCampaign.name : '通常時'}
        />
        <MetricCard
          label="即時キャンペーン"
          value={campaigns.filter((campaign) => campaign.apply_immediately && campaign.is_enabled).length.toString()}
          hint="有効件数"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">基本付与率</h2>
            <p className="mt-1 text-sm text-gray-400">購入利用レートは 1pt = 1円 固定です。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm text-gray-300">
              <span className="block text-xs uppercase tracking-wider text-gray-500">有効化</span>
              <select
                value={settingsForm.is_enabled ? 'enabled' : 'disabled'}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    is_enabled: event.target.value === 'enabled',
                  }))
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
              >
                <option value="enabled">有効</option>
                <option value="disabled">停止</option>
              </select>
            </label>
            <label className="space-y-2 text-sm text-gray-300">
              <span className="block text-xs uppercase tracking-wider text-gray-500">付与ポイント</span>
              <input
                type="number"
                min={1}
                max={100}
                value={settingsForm.base_points_per_unit}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    base_points_per_unit: Number(event.target.value || 1),
                  }))
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-gray-300">
              <span className="block text-xs uppercase tracking-wider text-gray-500">基準金額</span>
              <input
                type="number"
                min={1}
                max={100000}
                value={settingsForm.yen_per_point_unit}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    yen_per_point_unit: Number(event.target.value || 100),
                  }))
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={loading === 'settings'}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-gray-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {loading === 'settings' ? '保存中...' : '付与率を保存'}
          </button>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">手動付与・減算</h2>
            <p className="mt-1 text-sm text-gray-400">買い出しのお礼や調整に使えます。</p>
          </div>
          <div className="grid gap-4">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ユーザー名で検索"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none"
            />
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
            >
              {filteredUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.points_balance}pt)
                </option>
              ))}
            </select>
            {selectedUser && (
              <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3 text-sm text-gray-300">
                現在のポイント: <span className="font-mono text-white">{selectedUser.points_balance.toLocaleString()}pt</span>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-[160px_1fr]">
              <input
                type="number"
                value={manualDelta}
                onChange={(event) => setManualDelta(Number(event.target.value || 0))}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
              />
              <input
                type="text"
                value={manualNote}
                onChange={(event) => setManualNote(event.target.value)}
                placeholder="理由メモ（例: 買い出し協力のお礼）"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={submitManualDelta}
            disabled={loading === 'manual'}
            className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {loading === 'manual' ? '更新中...' : 'ポイントを反映'}
          </button>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">キャンペーン追加</h2>
            <p className="mt-1 text-sm text-gray-400">即時倍率アップと、予約キャンペーンの両方に使えます。</p>
          </div>
          <div className="grid gap-4">
            <input
              type="text"
              value={campaignForm.name}
              onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="キャンペーン名"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-gray-300">
                <span className="block text-xs uppercase tracking-wider text-gray-500">倍率</span>
                <input
                  type="number"
                  min={1}
                  step="0.1"
                  value={campaignForm.multiplier}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      multiplier: Number(event.target.value || 1),
                    }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                />
              </label>
              <label className="space-y-2 text-sm text-gray-300">
                <span className="block text-xs uppercase tracking-wider text-gray-500">メモ</span>
                <input
                  type="text"
                  value={campaignForm.note}
                  onChange={(event) => setCampaignForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="例: 新学期キャンペーン"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-gray-300">
                <span className="block text-xs uppercase tracking-wider text-gray-500">開始日時</span>
                <input
                  type="datetime-local"
                  value={campaignForm.starts_at}
                  onChange={(event) => setCampaignForm((current) => ({ ...current, starts_at: event.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                />
              </label>
              <label className="space-y-2 text-sm text-gray-300">
                <span className="block text-xs uppercase tracking-wider text-gray-500">終了日時</span>
                <input
                  type="datetime-local"
                  value={campaignForm.ends_at}
                  onChange={(event) => setCampaignForm((current) => ({ ...current, ends_at: event.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={campaignForm.apply_immediately}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    apply_immediately: event.target.checked,
                  }))
                }
                className="rounded border-gray-700 bg-gray-900 text-white"
              />
              今すぐ適用する
            </label>
          </div>
          <button
            type="button"
            onClick={createCampaign}
            disabled={loading === 'campaign-create'}
            className="rounded-lg bg-sky-500/20 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/25 disabled:opacity-50"
          >
            {loading === 'campaign-create' ? '保存中...' : 'キャンペーンを追加'}
          </button>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">キャンペーン一覧</h2>
            <p className="mt-1 text-sm text-gray-400">
              現在有効: {activeCampaign ? `${activeCampaign.name} (${activeCampaign.multiplier}x)` : '通常倍率'}
            </p>
          </div>
          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-6 text-sm text-gray-500">
                まだキャンペーンはありません。
              </div>
            ) : (
              campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{campaign.name}</p>
                      <p className="mt-1 text-sm text-gray-400">
                        {campaign.multiplier}x
                        {campaign.apply_immediately
                          ? ' · 即時適用'
                          : campaign.starts_at
                            ? ` · ${format(new Date(campaign.starts_at), 'M/d HH:mm', { locale: ja })} 〜 ${
                                campaign.ends_at
                                  ? format(new Date(campaign.ends_at), 'M/d HH:mm', { locale: ja })
                                  : '終了未設定'
                              }`
                            : ' · 開始待ち'}
                      </p>
                      {campaign.note ? (
                        <p className="mt-2 text-xs text-gray-500">{campaign.note}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateCampaign(campaign.id, {
                            is_enabled: !campaign.is_enabled,
                          })
                        }
                        disabled={loading === `campaign-${campaign.id}`}
                        className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-700 disabled:opacity-50"
                      >
                        {campaign.is_enabled ? '停止' : '再開'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCampaign(campaign.id)}
                        disabled={loading === `campaign-delete-${campaign.id}`}
                        className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/25 disabled:opacity-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">最近のポイント履歴</h2>
          <p className="mt-1 text-sm text-gray-400">ポイントの増減をここから追えます。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['日時', 'ユーザー', '内容', '増減', '残高'].map((label) => (
                  <th key={label} className="px-4 py-3 text-left font-medium text-gray-500 text-xs">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-gray-800/50">
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {format(new Date(transaction.created_at), 'M/d HH:mm', { locale: ja })}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{transaction.user?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {POINT_REASON_LABELS[transaction.reason_type]}
                    {transaction.note ? (
                      <p className="mt-1 text-xs text-gray-500">{transaction.note}</p>
                    ) : null}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      transaction.delta >= 0 ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {transaction.delta >= 0 ? '+' : ''}
                    {transaction.delta.toLocaleString()}pt
                  </td>
                  <td className="px-4 py-3 font-mono text-white">
                    {transaction.balance_after.toLocaleString()}pt
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
