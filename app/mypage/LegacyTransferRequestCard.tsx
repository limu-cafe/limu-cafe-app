'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

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
  const { locale } = useUserLocale();
  const [legacyName, setLegacyName] = useState(latestRequest?.legacy_name ?? '');
  const [note, setNote] = useState(latestRequest?.note ?? '');
  const [loading, setLoading] = useState(false);
  const copy =
    locale === 'en'
      ? {
          title: 'Legacy data transfer',
          description:
            'If you want to carry over your old balance or favorites, send a request and an admin will match the records.',
          failed: 'Failed to send transfer request',
          success: 'Transfer request sent',
          latest: 'Latest status',
          pending: 'Pending',
          completed: 'Transferred',
          rejected: 'Rejected',
          legacyName: 'Legacy name',
          note: 'Note',
          rejectionReason: 'Reason',
          legacyPlaceholder: 'Name used in the legacy system',
          notePlaceholder: 'Memo, e.g. I used the name Taro Yamada in the old system',
          submitting: 'Sending...',
          submit: 'Request transfer',
        }
      : {
          title: '旧システムデータ引き継ぎ',
          description:
            '旧システムの残高やお気に入りを引き継ぎたい場合は申請してください。管理者が旧データと照合して反映します。',
          failed: '申請に失敗しました',
          success: '引き継ぎ申請を送信しました',
          latest: '最新の申請状況',
          pending: '申請中',
          completed: '引き継ぎ完了',
          rejected: '却下',
          legacyName: '旧システム名',
          note: 'メモ',
          rejectionReason: '却下理由',
          legacyPlaceholder: '旧システムで使っていた名前',
          notePlaceholder: 'メモ（例: 旧システムでは山本太郎名義で使っていました）',
          submitting: '送信中...',
          submit: '引き継ぎを申請する',
        };

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
        throw new Error((await res.json()).error ?? copy.failed);
      }

      toast.success(copy.success);
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
        <h2 className="font-medium text-espresso">{copy.title}</h2>
      </div>

      <p className="text-sm text-espresso-400">
        {copy.description}
      </p>

      {latestRequest ? (
        <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm">
          <p className="font-medium text-espresso">
            {copy.latest}:
            <span className="ml-2">
              {latestRequest.status === 'pending'
                ? copy.pending
                : latestRequest.status === 'completed'
                ? copy.completed
                : copy.rejected}
            </span>
          </p>
          {latestRequest.legacy_name && (
            <p className="mt-1 text-espresso-500">{copy.legacyName}: {latestRequest.legacy_name}</p>
          )}
          {latestRequest.note && (
            <p className="mt-1 text-espresso-500">{copy.note}: {latestRequest.note}</p>
          )}
          {latestRequest.rejection_reason && (
            <p className="mt-2 text-red-600">{copy.rejectionReason}: {latestRequest.rejection_reason}</p>
          )}
        </div>
      ) : (
        <>
          <input
            value={legacyName}
            onChange={(e) => setLegacyName(e.target.value)}
            placeholder={copy.legacyPlaceholder}
            className="input"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.notePlaceholder}
            rows={3}
            className="input min-h-[100px] resize-none py-3"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? copy.submitting : copy.submit}
          </button>
        </>
      )}
    </div>
  );
}
