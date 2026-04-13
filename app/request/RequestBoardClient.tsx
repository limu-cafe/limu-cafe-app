'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Heart, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { enUS, ja } from 'date-fns/locale';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
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

export default function RequestBoardClient({
  requests,
}: {
  requests: RequestRow[];
}) {
  const router = useRouter();
  const { locale } = useUserLocale();
  const [loadingVoteId, setLoadingVoteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(
    'all'
  );
  const [localRequests, setLocalRequests] = useState(requests);
  const dateLocale = locale === 'en' ? enUS : ja;
  const copy =
    locale === 'en'
      ? {
          all: 'All',
          pending: 'Open',
          approved: 'Approved',
          rejected: 'Rejected',
          voted: 'Votes',
          detailsHint: 'See the detail page for the full reason and comments.',
          openDetail: 'Open details',
          emptyApproved: 'No approved requests yet.',
          emptyRejected: 'No rejected requests yet.',
          emptyFilter: 'No requests match this filter yet.',
          approvedList: 'Approved requests',
          rejectedList: 'Rejected requests',
          voteAction: 'Support',
          unknownUser: 'Unknown',
        }
      : {
          all: 'すべて',
          pending: '検討中',
          approved: '採用',
          rejected: '却下',
          voted: '賛成',
          detailsHint: '詳しい理由やコメントは詳細ページで確認できます。',
          openDetail: '詳細を見る',
          emptyApproved: '採用済みの要望はまだありません。',
          emptyRejected: '却下済みの要望はまだありません。',
          emptyFilter: 'この条件に当てはまる要望はまだありません。',
          approvedList: '採用された要望',
          rejectedList: '見送った要望',
          voteAction: '賛成する',
          unknownUser: '不明',
        };
  const statusConfig = {
    pending: {
      label: locale === 'en' ? 'Open' : '検討中',
      className: 'bg-amber-100 text-amber-700',
    },
    approved: {
      label: locale === 'en' ? 'Approved' : '採用',
      className: 'bg-emerald-100 text-emerald-700',
    },
    rejected: {
      label: locale === 'en' ? 'Rejected' : '却下',
      className: 'bg-rose-100 text-rose-700',
    },
  };

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  const visibleRequests = useMemo(() => {
    const priority = { pending: 0, approved: 1, rejected: 2 } as const;

    return [...localRequests]
      .filter((request) => (statusFilter === 'all' ? true : request.status === statusFilter))
      .sort((a, b) => {
        const statusGap = priority[a.status] - priority[b.status];
        if (statusGap !== 0) return statusGap;
        if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [localRequests, statusFilter]);

  const pendingRequests = visibleRequests.filter((request) => request.status === 'pending');
  const approvedRequests = visibleRequests.filter((request) => request.status === 'approved');
  const rejectedRequests = visibleRequests.filter((request) => request.status === 'rejected');

  const handleVote = async (requestId: string) => {
    const current = localRequests.find((request) => request.id === requestId);
    if (!current) return;

    const optimisticVoted = !current.has_voted;

    setLoadingVoteId(requestId);
    setLocalRequests((rows) =>
      rows.map((request) =>
        request.id === requestId
          ? {
              ...request,
              has_voted: optimisticVoted,
              vote_count: Math.max(0, request.vote_count + (optimisticVoted ? 1 : -1)),
            }
          : request
      )
    );

    try {
      const res = await fetch('/api/request-votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? '投票に失敗しました');
      }
      const data = await res.json();
      setLocalRequests((rows) =>
        rows.map((request) =>
          request.id === requestId
            ? {
                ...request,
                has_voted: Boolean(data.voted),
                vote_count:
                  Boolean(data.voted) === current.has_voted
                    ? current.vote_count
                    : Math.max(0, current.vote_count + (data.voted ? 1 : -1)),
              }
            : request
        )
      );
      startTransition(() => router.refresh());
    } catch (error: any) {
      setLocalRequests((rows) =>
        rows.map((request) =>
          request.id === requestId
            ? {
                ...request,
                has_voted: current.has_voted,
                vote_count: current.vote_count,
              }
            : request
        )
      );
      toast.error(error.message);
    } finally {
      setLoadingVoteId(null);
    }
  };

  const statusCounts = {
    all: localRequests.length,
    pending: localRequests.filter((request) => request.status === 'pending').length,
    approved: localRequests.filter((request) => request.status === 'approved').length,
    rejected: localRequests.filter((request) => request.status === 'rejected').length,
  };

  const renderCompactList = (
    title: string,
    rows: RequestRow[],
    emptyLabel: string
  ) => (
    <section className="rounded-[24px] border border-cream-200 bg-white px-4 py-4 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-espresso">{title}</h2>
        <span className="text-xs text-espresso-400">{rows.length}</span>
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
                  {request.user?.name ?? copy.unknownUser} ・ {copy.voted} {request.vote_count}
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
            ['all', copy.all],
            ['pending', copy.pending],
            ['approved', copy.approved],
            ['rejected', copy.rejected],
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
                        {statusConfig.pending.label}
                      </span>
                      {request.user && (
                        <span className="text-xs text-espresso-400">{request.user.name}</span>
                      )}
                      <span className="text-xs text-espresso-300">
                        {format(new Date(request.created_at), locale === 'en' ? 'MMM d HH:mm' : 'M月d日 HH:mm', { locale: dateLocale })}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl font-bold text-espresso">
                      {request.item_name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-espresso-500">
                      <p>
                        {locale === 'en' ? 'Desired price: ' : '希望価格: '}
                        {request.desired_price
                          ? `¥${request.desired_price.toLocaleString()}`
                          : locale === 'en'
                            ? 'Not set'
                            : '指定なし'}
                      </p>
                      <p>{copy.voted} {request.vote_count}</p>
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
                    {copy.voteAction}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-cream-100 bg-cream-50/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-espresso-500">
                    <MessageCircle size={15} className="text-espresso-400" />
                    {copy.detailsHint}
                  </div>
                  <Link
                    href={`/request/${request.id}`}
                    className="inline-flex items-center justify-center rounded-2xl bg-espresso px-4 py-3 text-sm font-medium text-cream-50 transition-colors hover:bg-espresso-600"
                  >
                    {copy.openDetail}
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {statusFilter !== 'pending' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderCompactList(copy.approvedList, approvedRequests, copy.emptyApproved)}
          {renderCompactList(copy.rejectedList, rejectedRequests, copy.emptyRejected)}
        </div>
      )}

      {visibleRequests.length === 0 && (
        <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-10 text-center text-sm text-espresso-400 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
          {copy.emptyFilter}
        </div>
      )}
    </div>
  );
}
