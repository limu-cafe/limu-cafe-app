'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

type TransferRequest = {
  id: string;
  status: 'pending' | 'completed' | 'rejected';
  legacy_name: string | null;
  note: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export default function LegacyTransferRequestCard({
  latestRequest,
}: {
  latestRequest: TransferRequest | null;
}) {
  const router = useRouter();
  const [legacyName, setLegacyName] = useState(latestRequest?.legacy_name ?? '');
  const [note, setNote] = useState(latestRequest?.note ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/legacy-transfer/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legacy_name: legacyName,
          note,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error ?? '申請に失敗しました');
      }

      toast.success('引き継ぎ申請を送信しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw size={18} className="text-espresso-500" />
        <h2 className="font-medium text-espresso">旧システムデータ引き継ぎ</h2>
      </div>

      <p className="text-sm text-espresso-400">
        旧システムの残高やお気に入りを引き継ぎたい場合は申請してください。管理者が旧データと照合して反映します。
      </p>

      {latestRequest ? (
        <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm">
          <p className="font-medium text-espresso">
            最新の申請状況:
            <span className="ml-2">
              {latestRequest.status === 'pending'
                ? '申請中'
                : latestRequest.status === 'completed'
                ? '引き継ぎ完了'
                : '却下'}
            </span>
          </p>
          {latestRequest.legacy_name && (
            <p className="mt-1 text-espresso-500">旧システム名: {latestRequest.legacy_name}</p>
          )}
          {latestRequest.note && (
            <p className="mt-1 text-espresso-500">メモ: {latestRequest.note}</p>
          )}
          {latestRequest.rejection_reason && (
            <p className="mt-2 text-red-600">却下理由: {latestRequest.rejection_reason}</p>
          )}
        </div>
      ) : (
        <>
          <input
            value={legacyName}
            onChange={(e) => setLegacyName(e.target.value)}
            placeholder="旧システムで使っていた名前"
            className="input"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="メモ（例: 旧システムでは山本太郎名義で使っていました）"
            rows={3}
            className="input min-h-[100px] resize-none py-3"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? '送信中...' : '引き継ぎを申請する'}
          </button>
        </>
      )}
    </div>
  );
}
