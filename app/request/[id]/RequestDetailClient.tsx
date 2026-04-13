'use client';

import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { ItemRequestComment } from '@/types';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

type RequestUser = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type RequestVote = {
  user_id: string;
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
  votes: RequestVote[];
  comments: (ItemRequestComment & { user?: RequestUser })[];
};

export default function RequestDetailClient({
  requestItem,
  currentUserId,
}: {
  requestItem: RequestRow;
  currentUserId: string;
}) {
  const router = useRouter();
  const { locale } = useUserLocale();
  const [loadingVote, setLoadingVote] = useState(false);
  const [loadingComment, setLoadingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [localRequest, setLocalRequest] = useState(requestItem);
  const dateLocale = locale === 'en' ? enUS : ja;
  const copy =
    locale === 'en'
      ? {
          back: 'Back to requests',
          desiredPrice: 'Desired price',
          notSet: 'Not set',
          votes: 'Votes',
          comments: 'Comments',
          voted: 'Supported',
          vote: 'Support',
          reasonTitle: 'Reason / note',
          adminNote: 'Admin note',
          commentTitle: 'Comments',
          noComments: 'No comments yet.',
          unknownUser: 'Unknown user',
          commentPlaceholder: 'Write a comment',
          commentAction: 'Comment',
          commentRequired: 'Please enter a comment',
          voteFailed: 'Failed to update support',
          commentFailed: 'Failed to post comment',
        }
      : {
          back: '要望一覧に戻る',
          desiredPrice: '希望価格',
          notSet: '指定なし',
          votes: '賛成',
          comments: 'コメント',
          voted: '賛成済み',
          vote: '賛成する',
          reasonTitle: '理由・補足',
          adminNote: '管理者メモ',
          commentTitle: 'コメント',
          noComments: 'まだコメントはありません。',
          unknownUser: '不明なユーザー',
          commentPlaceholder: 'コメントを入力してください',
          commentAction: 'コメントする',
          commentRequired: 'コメントを入力してください',
          voteFailed: '投票に失敗しました',
          commentFailed: 'コメントの投稿に失敗しました',
        };
  const statusConfig = {
    pending: { label: locale === 'en' ? 'Open' : '検討中', className: 'bg-amber-100 text-amber-700' },
    approved: { label: locale === 'en' ? 'Approved' : '採用', className: 'bg-emerald-100 text-emerald-700' },
    rejected: { label: locale === 'en' ? 'Rejected' : '却下', className: 'bg-rose-100 text-rose-700' },
  };

  useEffect(() => {
    setLocalRequest(requestItem);
  }, [requestItem]);

  const hasVoted = localRequest.votes.some((vote) => vote.user_id === currentUserId);
  const statusMeta = statusConfig[localRequest.status];

  const handleVote = async () => {
    const optimisticVoted = !hasVoted;
    setLoadingVote(true);
    setLocalRequest((current) => ({
      ...current,
      votes: optimisticVoted
        ? [...current.votes, { user_id: currentUserId }]
        : current.votes.filter((vote) => vote.user_id !== currentUserId),
    }));

    try {
      const res = await fetch('/api/request-votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: localRequest.id }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? copy.voteFailed);
      }
      const data = await res.json();
      setLocalRequest((current) => ({
        ...current,
        votes: data.voted
          ? current.votes.some((vote) => vote.user_id === currentUserId)
            ? current.votes
            : [...current.votes, { user_id: currentUserId }]
          : current.votes.filter((vote) => vote.user_id !== currentUserId),
      }));
      startTransition(() => router.refresh());
    } catch (error: any) {
      setLocalRequest(requestItem);
      toast.error(error.message);
    } finally {
      setLoadingVote(false);
    }
  };

  const handleComment = async () => {
    const body = commentDraft.trim();
    if (!body) {
      toast.error(copy.commentRequired);
      return;
    }

    setLoadingComment(true);
    try {
      const res = await fetch('/api/request-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: localRequest.id, body }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? copy.commentFailed);
      }
      setCommentDraft('');
      startTransition(() => router.refresh());
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingComment(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link
        href="/request"
        className="inline-flex items-center rounded-full bg-white px-3 py-2 text-sm text-espresso-500 ring-1 ring-cream-200 transition-colors hover:bg-cream-50"
      >
        {copy.back}
      </Link>

      <section className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
              {requestItem.user && (
              <span className="text-xs text-espresso-400">{requestItem.user.name}</span>
            )}
              <span className="text-xs text-espresso-300">
                {format(new Date(localRequest.created_at), locale === 'en' ? 'MMM d HH:mm' : 'M月d日 HH:mm', { locale: dateLocale })}
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold text-espresso">
              {localRequest.item_name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-espresso-500">
              <p>
                {copy.desiredPrice}:{' '}
                {localRequest.desired_price
                  ? `¥${localRequest.desired_price.toLocaleString()}`
                  : copy.notSet}
              </p>
              <p>{copy.votes} {localRequest.votes.length}</p>
              <p>{copy.comments} {localRequest.comments.length}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleVote}
            disabled={loadingVote}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
              hasVoted
                ? 'bg-rose-500 text-white hover:bg-rose-600'
                : 'bg-cream-50 text-espresso ring-1 ring-cream-200 hover:bg-cream-100'
            }`}
          >
            <Heart size={16} className={hasVoted ? 'fill-current' : ''} />
            {hasVoted ? copy.voted : copy.vote}
          </button>
        </div>

        {localRequest.reason ? (
          <div className="mt-5 rounded-[24px] border border-cream-100 bg-cream-50/70 px-4 py-4">
            <p className="mb-2 text-xs font-medium tracking-[0.12em] text-espresso-400 uppercase">
              {copy.reasonTitle}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-espresso-600">
              {localRequest.reason}
            </p>
          </div>
        ) : null}

        {localRequest.admin_note ? (
          <div className="mt-4 rounded-[24px] border border-cream-100 bg-cream-50/70 px-4 py-4">
            <p className="mb-2 text-xs font-medium tracking-[0.12em] text-espresso-400 uppercase">
              {copy.adminNote}
            </p>
            <p className="text-sm leading-7 text-espresso-600">{localRequest.admin_note}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle size={16} className="text-espresso-400" />
          <h2 className="text-base font-semibold text-espresso">{copy.commentTitle}</h2>
        </div>

        <div className="space-y-3">
          {localRequest.comments.length === 0 ? (
            <div className="rounded-2xl bg-cream-50 px-4 py-4 text-sm text-espresso-400">
              {copy.noComments}
            </div>
          ) : (
            localRequest.comments.map((comment) => {
              const isOwn = comment.user_id === currentUserId;

              return (
                <div
                  key={comment.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[86%] rounded-[20px] px-3.5 py-3 text-sm shadow-[0_10px_30px_-28px_rgba(44,26,14,0.25)] ${
                      isOwn ? 'bg-espresso text-cream-50' : 'bg-cream-50 text-espresso'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] opacity-75">
                      <span>{comment.user?.name ?? copy.unknownUser}</span>
                      <span>{format(new Date(comment.created_at), locale === 'en' ? 'MMM d HH:mm' : 'M/d HH:mm', { locale: dateLocale })}</span>
                      {comment.source === 'slack' ? <span>Slack</span> : null}
                    </div>
                    <p className="whitespace-pre-wrap leading-6">{comment.body}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 rounded-[24px] border border-cream-200 bg-cream-50 p-3">
          <textarea
            rows={3}
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder={copy.commentPlaceholder}
            className="w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 text-espresso placeholder:text-espresso-300 focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleComment}
              disabled={loadingComment}
              className="inline-flex items-center gap-2 rounded-2xl bg-espresso px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-espresso-600 disabled:opacity-60"
            >
              <Send size={15} />
              {copy.commentAction}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
