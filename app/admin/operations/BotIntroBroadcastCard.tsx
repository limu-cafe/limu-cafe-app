'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

type EligibleUser = {
  id: string;
  name: string | null;
};

export default function BotIntroBroadcastCard({
  eligibleCount,
  eligibleUsers,
}: {
  eligibleCount: number;
  eligibleUsers: EligibleUser[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const sendBotIntro = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/slack/bot-intro', {
        method: 'POST',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Slack DM の送信に失敗しました');

      toast.success(`対象 ${payload.eligible}人中 ${payload.sent}人に送信しました`);
      if (payload.failed) {
        const failedNames = Array.isArray(payload.failed_users)
          ? payload.failed_users.map((user: { name?: string | null }) => user.name || '名前未設定').join('、')
          : '';
        toast.error(
          failedNames
            ? `${payload.failed}人には送信できませんでした: ${failedNames}`
            : `${payload.failed}人には送信できませんでした`
        );
      }
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Bot案内</h2>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
            {eligibleCount}人
          </span>
        </div>
        <button
          type="button"
          onClick={sendBotIntro}
          disabled={loading || eligibleCount === 0}
          className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-950 transition disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        >
          {loading ? '送信中...' : eligibleCount === 0 ? '送信対象なし' : '一括送信する'}
        </button>
      </div>

      {eligibleUsers.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-400">未送信候補</p>
          <div className="flex flex-wrap gap-2">
            {eligibleUsers.map((user) => (
              <span
                key={user.id}
                className="rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-gray-200"
              >
                {user.name || '名前未設定'}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
