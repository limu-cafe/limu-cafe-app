'use client';

import { useState } from 'react';
import Link from 'next/link';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import ObjectDetailNavigation, { useObjectDetailView } from '@/components/admin/ObjectDetailNavigation';
import UserPointAdjustment from '@/components/admin/UserPointAdjustment';
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
  const [view,setView]=useObjectDetailView(['policy','campaigns','history']);
  const [campaignId,selectCampaign]=useObjectSelection('campaign');
  const [creating,setCreating]=useState(false);
  const selectedCampaign=campaigns.find(campaign=>campaign.id===campaignId);
  const searchParams = useSearchParams();
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
  const [loading, setLoading] = useState<string | null>(null);

  const activeCampaign = getActivePointCampaign(campaigns);
  const currentMultiplier = getCurrentPointMultiplier(campaigns);
  const selectedUser = users.find(user => user.id === searchParams.get('user')) ?? null;

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

  if(searchParams.get('user')&&selectedUser)return <div className="mx-auto max-w-2xl space-y-5"><Link href={'/admin/users?user='+selectedUser.id+'&view=points'} className="text-sm text-sky-300 underline">この利用者のポイントへ戻る →</Link><h1 className="text-2xl font-bold text-white">{selectedUser.name}のポイント</h1><UserPointAdjustment key={selectedUser.id} user={selectedUser}/></div>;
  return <div className="mx-auto max-w-5xl space-y-5"><header><h1 className="text-2xl font-bold text-white">ポイント制度</h1><p className="mt-1 text-sm text-gray-400">全体の付与ルールとキャンペーンを管理します。個人の調整は利用者の詳細で行います。</p></header><ObjectDetailNavigation value={view} onChange={setView} options={[{id:'policy',label:'付与ルール'},{id:'campaigns',label:'キャンペーン'},{id:'history',label:'付与履歴'}]}/>
    {view==='policy'&&<section className="max-w-2xl space-y-5 rounded-xl border border-gray-800 bg-gray-900 p-5"><h2 className="font-semibold text-white">基本付与ルール</h2><p className="text-lg text-white">{formatPointRule(settings)}</p><p className="text-sm text-gray-400">{settings.is_enabled?'有効':'停止中'} · 現在の倍率 {currentMultiplier}x · {activeCampaign?.name??'通常時'}</p><p className="text-sm text-gray-400">即時キャンペーン {campaigns.filter(campaign=>campaign.apply_immediately&&campaign.is_enabled).length}件</p><details><summary className="cursor-pointer text-sm text-sky-300">付与ルールを編集</summary><div className="mt-4">        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
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
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
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
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
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
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
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
        </section></div></details></section>}
    {view==='campaigns'&&<div className="space-y-4"><button type="button" onClick={()=>setCreating(value=>!value)} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950">{creating?'追加を閉じる':'キャンペーンを追加'}</button>{creating&&<div className="max-w-2xl">        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
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
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-hidden"
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
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                />
              </label>
              <label className="space-y-2 text-sm text-gray-300">
                <span className="block text-xs uppercase tracking-wider text-gray-500">メモ</span>
                <input
                  type="text"
                  value={campaignForm.note}
                  onChange={(event) => setCampaignForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="例: 新学期キャンペーン"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-hidden"
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
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                />
              </label>
              <label className="space-y-2 text-sm text-gray-300">
                <span className="block text-xs uppercase tracking-wider text-gray-500">終了日時</span>
                <input
                  type="datetime-local"
                  value={campaignForm.ends_at}
                  onChange={(event) => setCampaignForm((current) => ({ ...current, ends_at: event.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
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
                className="rounded-sm border-gray-700 bg-gray-900 text-white"
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
            {loading === 'campaign-create' ? '保存中...' : 'キャンペーンを作成'}
          </button>
        </section></div>}<ObjectWorkspace selected={Boolean(selectedCampaign)} label="キャンペーンの詳細" onClose={()=>selectCampaign(null)} collection={<div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">{campaigns.map(campaign=><button key={campaign.id} type="button" aria-pressed={campaign.id===campaignId} onClick={()=>selectCampaign(campaign.id)} className="block w-full px-4 py-4 text-left"><span className="text-sm text-white">{campaign.name}</span><small className="mt-1 block text-gray-400">{campaign.multiplier}x · {campaign.is_enabled?'有効':'停止中'} · {campaign.apply_immediately?'即時適用':campaign.starts_at??'開始待ち'}</small></button>)}{!campaigns.length&&<p className="p-6 text-sm text-gray-400">キャンペーンはありません</p>}</div>} detail={selectedCampaign&&<section className="space-y-5">
  <h2 className="text-lg font-semibold text-white">{selectedCampaign.name}</h2>
  <dl className="grid grid-cols-[6rem_1fr] gap-3 text-sm"><dt className="text-gray-400">状態</dt><dd className="text-white">{selectedCampaign.is_enabled?'有効':'停止中'}</dd><dt className="text-gray-400">倍率</dt><dd className="font-mono text-white">{selectedCampaign.multiplier}x</dd><dt className="text-gray-400">適用期間</dt><dd className="text-white">{selectedCampaign.apply_immediately?'即時適用':selectedCampaign.starts_at?format(new Date(selectedCampaign.starts_at),'yyyy/M/d HH:mm',{locale:ja}):'開始待ち'}{!selectedCampaign.apply_immediately&&<> ～ {selectedCampaign.ends_at?format(new Date(selectedCampaign.ends_at),'yyyy/M/d HH:mm',{locale:ja}):'終了未設定'}</>}</dd></dl>
  {selectedCampaign.note&&<p className="whitespace-pre-wrap wrap-break-word text-sm text-gray-300">{selectedCampaign.note}</p>}
  <div className="flex gap-3 border-t border-gray-800 pt-5"><button type="button" onClick={()=>updateCampaign(selectedCampaign.id,{is_enabled:!selectedCampaign.is_enabled})} disabled={loading!==null} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950 disabled:opacity-50">{selectedCampaign.is_enabled?'停止':'再開'}</button><button type="button" onClick={()=>deleteCampaign(selectedCampaign.id)} disabled={loading!==null} className="rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-300 disabled:opacity-50">削除</button></div>
</section>}/></div>}
    {view==='history'&&      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
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
                  <td className="px-4 py-3 text-gray-300"><Link href={'/admin/users?user='+transaction.user_id+'&view=points'} className="text-sky-300 underline">{transaction.user?.name??'利用者'}</Link></td>
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
      </section>}
  </div>;
}
