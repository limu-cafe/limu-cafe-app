'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

export default function BotIntroBroadcastCard({ eligibleCount }: { eligibleCount: number }) {
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
        toast.error(`${payload.failed}人には送信できませんでした`);
      }
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Bot案内を一括送信</h2>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            Slack 上で LIMU喫茶bot を見つけやすくするため、未送信ユーザーへ Welcome DM を一度だけ送ります。
          </p>
          <p className="mt-3 text-sm text-amber-300">
            現在の未送信ユーザー: <span className="font-semibold">{eligibleCount}人</span>
          </p>
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
    </section>
  );
}
