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

export default async function RequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: requests }, { data: votes }, { data: comments }] = await Promise.all([
    supabase
      .from('item_requests')
      .select('*, user:users!item_requests_user_id_fkey(id, name, avatar_url)')
      .order('created_at', { ascending: false }),
    supabase
      .from('item_request_votes')
      .select('request_id, user_id'),
    supabase
      .from('item_request_comments')
      .select('*, user:users!item_request_comments_user_id_fkey(id, name, avatar_url)')
      .order('created_at', { ascending: true }),
  ]);

  const votesByRequest = new Map<string, Array<{ user_id: string }>>();
  for (const vote of votes ?? []) {
    const existing = votesByRequest.get(vote.request_id) ?? [];
    existing.push({ user_id: vote.user_id });
    votesByRequest.set(vote.request_id, existing);
  }

  const commentsByRequest = new Map<
    string,
    Array<ItemRequestComment & { user?: RequestUser }>
  >();
  for (const comment of (comments ?? []) as Array<ItemRequestComment & { user?: RequestUser }>) {
    const existing = commentsByRequest.get(comment.request_id) ?? [];
    existing.push(comment);
    commentsByRequest.set(comment.request_id, existing);
  }

  const boardRequests = (requests ?? []).map((request: any) => ({
    ...request,
    votes: votesByRequest.get(request.id) ?? [],
    comments: commentsByRequest.get(request.id) ?? [],
  }));

  return (
    <UserLayout>
      <div className="mx-auto max-w-6xl space-y-8 animate-fade-in">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-espresso">商品の要望</h1>
              <p className="mt-1 text-sm text-espresso-400">
                欲しい商品を出して、みんなで賛成やコメントを集められます。
              </p>
            </div>
            <RequestForm />
            <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
              <h2 className="font-medium text-espresso">このページでできること</h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-espresso-500">
                <p>新しい要望を出せます。</p>
                <p>他の人の要望にも賛成できます。</p>
                <p>要望の下で、ツッコミや補足をチャットのように書けます。</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-espresso">みんなの要望</h2>
              <p className="mt-1 text-sm text-espresso-400">
                検討中の要望が上に来ます。票が多いものほど見つけやすくしています。
              </p>
            </div>
            <RequestBoardClient requests={boardRequests} currentUserId={user.id} />
          </div>
        </div>
      </div>
    </UserLayout>
  );
}
