'use client';

import { useState } from 'react';
import { CheckCircle, Download } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import type { SettlementReminderSettings } from '@/lib/settlement-reminder';

export default function SettlementClient({
  users,
  history,
  reminderSettings,
}: {
  users: any[];
  history: any[];
  reminderSettings: SettlementReminderSettings;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [method, setMethod] = useState<Record<string, string>>({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(reminderSettings.is_enabled);
  const [nextNotificationOn, setNextNotificationOn] = useState(reminderSettings.next_notification_on);
  const [intervalMonths, setIntervalMonths] = useState(reminderSettings.interval_months);

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

  const handleSaveReminderSettings = async () => {
    setScheduleLoading(true);
    try {
      const res = await fetch('/api/admin/settlement-reminder-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_enabled: scheduleEnabled,
          next_notification_on: nextNotificationOn,
          interval_months: intervalMonths,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '通知設定の保存に失敗しました');
      toast.success('精算通知の設定を保存しました');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setScheduleLoading(false);
    }
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

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">精算通知の設定</h2>
            <p className="mt-1 text-sm text-gray-400">
              次回通知日を起点に、指定したか月ごとに後払い残高の DM を送ります。
            </p>
          </div>
          {reminderSettings.last_notified_on && (
            <p className="text-xs text-gray-500">
              前回通知: {format(new Date(reminderSettings.last_notified_on), 'yyyy/MM/dd', { locale: ja })}
            </p>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[180px_1fr_180px_auto] lg:items-end">
          <label className="space-y-2 text-sm text-gray-300">
            <span className="block text-xs uppercase tracking-wider text-gray-500">通知</span>
            <select
              value={scheduleEnabled ? 'enabled' : 'disabled'}
              onChange={(e) => setScheduleEnabled(e.target.value === 'enabled')}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="enabled">有効</option>
              <option value="disabled">停止</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-gray-300">
            <span className="block text-xs uppercase tracking-wider text-gray-500">次回通知日</span>
            <input
              type="date"
              value={nextNotificationOn}
              onChange={(e) => setNextNotificationOn(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none"
            />
          </label>

          <label className="space-y-2 text-sm text-gray-300">
            <span className="block text-xs uppercase tracking-wider text-gray-500">通知間隔</span>
            <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
              <input
                type="number"
                min={1}
                max={12}
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(Number(e.target.value || 1))}
                className="w-16 bg-transparent text-sm text-white focus:outline-none"
              />
              <span className="text-sm text-gray-400">か月ごと</span>
            </div>
          </label>

          <button
            type="button"
            onClick={handleSaveReminderSettings}
            disabled={scheduleLoading}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-gray-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {scheduleLoading ? '保存中...' : '設定を保存'}
          </button>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3 text-sm text-gray-400">
          {scheduleEnabled
            ? `${nextNotificationOn} を次回通知日として、以後は ${intervalMonths} か月ごとに通知します。`
            : '精算通知は現在停止中です。'}
        </div>
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
