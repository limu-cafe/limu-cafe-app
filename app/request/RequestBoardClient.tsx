'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Heart, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
type RequestUser = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type RequestRow = {
  id: string;
  user_id: string;
  item_name: string;
  reason?: string | null;
  desired_price?: number | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
  user?: RequestUser;
  vote_count: number;
  has_voted: boolean;
};

const statusConfig = {
  pending: { label: '検討中', className: 'bg-amber-100 text-amber-700' },
  approved: { label: '採用', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '却下', className: 'bg-rose-100 text-rose-700' },
};

export default function RequestBoardClient({
  requests,
}: {
  requests: RequestRow[];
}) {
  const router = useRouter();
  const [loadingVoteId, setLoadingVoteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(
    'all'
  );

  const visibleRequests = useMemo(() => {
    const priority = { pending: 0, approved: 1, rejected: 2 } as const;

    return [...requests]
      .filter((request) => (statusFilter === 'all' ? true : request.status === statusFilter))
      .sort((a, b) => {
        const statusGap = priority[a.status] - priority[b.status];
        if (statusGap !== 0) return statusGap;
        if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [requests, statusFilter]);

  const pendingRequests = visibleRequests.filter((request) => request.status === 'pending');
  const approvedRequests = visibleRequests.filter((request) => request.status === 'approved');
  const rejectedRequests = visibleRequests.filter((request) => request.status === 'rejected');

  const handleVote = async (requestId: string) => {
    setLoadingVoteId(requestId);
    try {
      const res = await fetch('/api/request-votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? '投票に失敗しました');
      }
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingVoteId(null);
    }
  };

  const statusCounts = {
    all: requests.length,
    pending: requests.filter((request) => request.status === 'pending').length,
    approved: requests.filter((request) => request.status === 'approved').length,
    rejected: requests.filter((request) => request.status === 'rejected').length,
  };

  const renderCompactList = (
    title: string,
    rows: RequestRow[],
    emptyLabel: string
  ) => (
    <section className="rounded-[24px] border border-cream-200 bg-white px-4 py-4 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-espresso">{title}</h2>
        <span className="text-xs text-espresso-400">{rows.length}件</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-espresso-400">{emptyLabel}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((request) => (
            <Link
              key={request.id}
              href={`/request/${request.id}`}
              className="flex items-center justify-between rounded-2xl border border-cream-100 bg-cream-50/70 px-3 py-3 transition-colors hover:bg-cream-100"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-espresso">{request.item_name}</p>
                <p className="mt-1 text-xs text-espresso-400">
                  {request.user?.name ?? '不明'} ・ 賛成 {request.vote_count}
                </p>
              </div>
              <span
                className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusConfig[request.status].className}`}
              >
                {statusConfig[request.status].label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-cream-200 bg-white px-4 py-4 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'すべて'],
            ['pending', '検討中'],
            ['approved', '採用'],
            ['rejected', '却下'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setStatusFilter(value as 'all' | 'pending' | 'approved' | 'rejected')
              }
              className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === value
                  ? 'bg-espresso text-cream-50'
                  : 'bg-white text-espresso-500 ring-1 ring-cream-200 hover:bg-cream-50'
              }`}
            >
              {label} {statusCounts[value as keyof typeof statusCounts]}
            </button>
          ))}
        </div>
      </div>

      {pendingRequests.length > 0 && (
        <div className="space-y-4">
          {pendingRequests.map((request) => {
            const hasVoted = request.has_voted;

            return (
              <section
                key={request.id}
                id={`request-${request.id}`}
                className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.pending.className}`}>
                        検討中
                      </span>
                      {request.user && (
                        <span className="text-xs text-espresso-400">{request.user.name}</span>
                      )}
                      <span className="text-xs text-espresso-300">
                        {format(new Date(request.created_at), 'M月d日 HH:mm', { locale: ja })}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl font-bold text-espresso">
                      {request.item_name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-espresso-500">
                      <p>
                        希望価格:{' '}
                        {request.desired_price
                          ? `¥${request.desired_price.toLocaleString()}`
                          : '指定なし'}
                      </p>
                      <p>賛成 {request.vote_count}</p>
                    </div>
                    {request.reason ? (
                      <p className="line-clamp-2 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-espresso-600">
                        {request.reason}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleVote(request.id)}
                    disabled={loadingVoteId === request.id}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                      hasVoted
                        ? 'bg-rose-500 text-white hover:bg-rose-600'
                        : 'bg-cream-50 text-espresso ring-1 ring-cream-200 hover:bg-cream-100'
                    }`}
                  >
                    <Heart size={16} className={hasVoted ? 'fill-current' : ''} />
                    賛成する
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-cream-100 bg-cream-50/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-espresso-500">
                    <MessageCircle size={15} className="text-espresso-400" />
                    詳しい理由やコメントは詳細ページで確認できます。
                  </div>
                  <Link
                    href={`/request/${request.id}`}
                    className="inline-flex items-center justify-center rounded-2xl bg-espresso px-4 py-3 text-sm font-medium text-cream-50 transition-colors hover:bg-espresso-600"
                  >
                    詳細を見る
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {statusFilter !== 'pending' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderCompactList('採用された要望', approvedRequests, '採用済みの要望はまだありません。')}
          {renderCompactList('見送った要望', rejectedRequests, '却下済みの要望はまだありません。')}
        </div>
      )}

      {visibleRequests.length === 0 && (
        <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-10 text-center text-sm text-espresso-400 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
          この条件に当てはまる要望はまだありません。
        </div>
      )}
    </div>
  );
}
