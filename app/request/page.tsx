import { redirect } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import type { ItemRequestComment } from '@/types';
import RequestForm from './RequestForm';
import RequestBoardClient from './RequestBoardClient';

type RequestUser = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type RequestListRow = {
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
  votes: Array<{ user_id: string }>;
  comments: Array<ItemRequestComment & { user?: RequestUser }>;
};

export default async function RequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: requests } = await supabase
    .from('item_requests')
    .select(
      'id, user_id, item_name, reason, desired_price, status, admin_note, created_at, updated_at, user:users!item_requests_user_id_fkey(id, name, avatar_url), votes:item_request_votes(user_id), comments:item_request_comments(id, request_id, user_id, body, source, created_at, user:users!item_request_comments_user_id_fkey(id, name, avatar_url))'
    )
    .order('created_at', { ascending: false })
    .order('created_at', { ascending: false, foreignTable: 'comments' })
    .limit(1, { foreignTable: 'comments' });

  const boardRequests = ((requests ?? []) as any[]).map((request) => ({
    ...request,
    user: Array.isArray(request.user) ? request.user[0] : request.user,
    comments: (request.comments ?? []).map((comment: any) => ({
      ...comment,
      user: Array.isArray(comment.user) ? comment.user[0] : comment.user,
    })),
  })) as RequestListRow[];

  return (
    <UserLayout>
      <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-espresso">商品の要望</h1>
            <p className="mt-1 text-sm text-espresso-400">
              欲しい商品を共有して、賛成やコメントを集められます。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-espresso-500">
            <span className="rounded-full bg-white px-3 py-2 ring-1 ring-cream-200">
              要望 {boardRequests.length}件
            </span>
            <span className="rounded-full bg-white px-3 py-2 ring-1 ring-cream-200">
              検討中 {boardRequests.filter((request) => request.status === 'pending').length}件
            </span>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <RequestForm />

            <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
              <h2 className="text-sm font-semibold text-espresso">使い方</h2>
              <div className="mt-3 space-y-2 text-sm leading-6 text-espresso-500">
                <p>商品名と理由を書いて要望を投稿できます。</p>
                <p>他の要望に賛成したり、コメントで意見を追加できます。</p>
                <p>採用された要望は購入候補として管理者に共有されます。</p>
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
              <h2 className="font-medium text-espresso">みんなの要望</h2>
              <p className="mt-1 text-sm text-espresso-400">
                一覧では要点だけを表示しています。詳しい内容やコメントは詳細ページで確認できます。
              </p>
            </div>
            <RequestBoardClient requests={boardRequests} currentUserId={user.id} />
          </section>
        </div>
      </div>
    </UserLayout>
  );
}
