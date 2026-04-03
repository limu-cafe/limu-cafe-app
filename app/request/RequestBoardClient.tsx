'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { ItemRequest, ItemRequestComment } from '@/types';

type RequestUser = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type RequestVote = {
  user_id: string;
};

type RequestRow = ItemRequest & {
  user?: RequestUser;
  votes: RequestVote[];
  comments: (ItemRequestComment & { user?: RequestUser })[];
};

const statusConfig = {
  pending: { label: '検討中', className: 'bg-amber-100 text-amber-700' },
  approved: { label: '採用', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '却下', className: 'bg-rose-100 text-rose-700' },
};

export default function RequestBoardClient({
  requests,
  currentUserId,
}: {
  requests: RequestRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [loadingVoteId, setLoadingVoteId] = useState<string | null>(null);
  const [commentLoadingId, setCommentLoadingId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
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
        if (b.votes.length !== a.votes.length) return b.votes.length - a.votes.length;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [requests, statusFilter]);

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

  const handleComment = async (requestId: string) => {
    const body = commentDrafts[requestId]?.trim();
    if (!body) {
      toast.error('コメントを入力してください');
      return;
    }

    setCommentLoadingId(requestId);
    try {
      const res = await fetch('/api/request-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, body }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? 'コメントの投稿に失敗しました');
      }
      setCommentDrafts((current) => ({ ...current, [requestId]: '' }));
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCommentLoadingId(null);
    }
  };

  const statusCounts = {
    all: requests.length,
    pending: requests.filter((request) => request.status === 'pending').length,
    approved: requests.filter((request) => request.status === 'approved').length,
    rejected: requests.filter((request) => request.status === 'rejected').length,
  };

  return (
    <div className="space-y-5">
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

      {visibleRequests.length === 0 ? (
        <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-10 text-center text-sm text-espresso-400 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
          この条件に当てはまる要望はまだありません。
        </div>
      ) : (
      <div className="space-y-4">
        {visibleRequests.map((request) => {
          const statusMeta = statusConfig[request.status];
          const hasVoted = request.votes.some((vote) => vote.user_id === currentUserId);

          return (
            <section
              key={request.id}
              id={`request-${request.id}`}
              className="overflow-hidden rounded-[28px] border border-cream-200 bg-white shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]"
            >
              <div className="space-y-4 border-b border-cream-100 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      {request.user && (
                        <span className="text-xs text-espresso-400">
                          {request.user.name}
                        </span>
                      )}
                      <span className="text-xs text-espresso-300">
                        {format(new Date(request.created_at), 'M月d日 HH:mm', { locale: ja })}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl font-bold text-espresso">
                      {request.item_name}
                    </h2>
                    {request.desired_price ? (
                      <p className="text-sm text-espresso-500">
                        希望価格: ¥{request.desired_price.toLocaleString()}
                      </p>
                    ) : null}
                    {request.reason ? (
                      <p className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-espresso-600">
                        {request.reason}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleVote(request.id)}
                    disabled={loadingVoteId === request.id}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                      hasVoted
                        ? 'bg-rose-500 text-white hover:bg-rose-600'
                        : 'bg-cream-50 text-espresso ring-1 ring-cream-200 hover:bg-cream-100'
                    }`}
                  >
                    <Heart size={16} className={hasVoted ? 'fill-current' : ''} />
                    賛成 {request.votes.length}
                  </button>
                </div>

                {request.admin_note ? (
                  <div className="rounded-2xl bg-cream-50 px-4 py-3 text-sm text-espresso-600">
                    <p className="mb-1 text-xs font-medium tracking-[0.12em] text-espresso-400 uppercase">
                      管理者メモ
                    </p>
                    {request.admin_note}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 px-5 py-5">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-espresso-400" />
                  <p className="text-sm font-medium text-espresso">
                    コメント {request.comments.length}件
                  </p>
                </div>

                <div className="space-y-3">
                  {request.comments.length === 0 ? (
                    <div className="rounded-2xl bg-cream-50 px-4 py-4 text-sm text-espresso-400">
                      まだコメントはありません。ツッコミや賛同を気軽に書いてください。
                    </div>
                  ) : (
                    request.comments.map((comment) => {
                      const isOwn = comment.user_id === currentUserId;

                      return (
                        <div
                          key={comment.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-[22px] px-4 py-3 text-sm shadow-[0_10px_30px_-28px_rgba(44,26,14,0.25)] ${
                              isOwn
                                ? 'bg-espresso text-cream-50'
                                : 'bg-cream-50 text-espresso'
                            }`}
                          >
                            <div className="mb-1 flex items-center gap-2 text-[11px] opacity-75">
                              <span>{comment.user?.name ?? '不明なユーザー'}</span>
                              <span>
                                {format(new Date(comment.created_at), 'M/d HH:mm', {
                                  locale: ja,
                                })}
                              </span>
                              {comment.source === 'slack' ? <span>Slack</span> : null}
                            </div>
                            <p className="whitespace-pre-wrap leading-6">{comment.body}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="rounded-[24px] border border-cream-200 bg-cream-50 p-3">
                  <textarea
                    rows={2}
                    value={commentDrafts[request.id] ?? ''}
                    onChange={(event) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    placeholder="この要望へのツッコミや賛同を書いてください"
                    className="w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 text-espresso placeholder:text-espresso-300 focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleComment(request.id)}
                      disabled={commentLoadingId === request.id}
                      className="inline-flex items-center gap-2 rounded-2xl bg-espresso px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-espresso-600 disabled:opacity-60"
                    >
                      <Send size={15} />
                      コメントする
                    </button>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      )}
    </div>
  );
}
