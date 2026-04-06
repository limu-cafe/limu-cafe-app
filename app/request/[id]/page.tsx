import { notFound, redirect } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import RequestDetailClient from './RequestDetailClient';

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: requestItem } = await supabase
    .from('item_requests')
    .select(
      'id, user_id, item_name, reason, desired_price, status, admin_note, created_at, updated_at, user:users!item_requests_user_id_fkey(id, name, avatar_url), votes:item_request_votes(user_id), comments:item_request_comments(id, request_id, user_id, body, source, created_at, user:users!item_request_comments_user_id_fkey(id, name, avatar_url))'
    )
    .eq('id', id)
    .order('created_at', { ascending: true, foreignTable: 'comments' })
    .single();

  if (!requestItem) notFound();

  const normalizedRequest = {
    ...(requestItem as any),
    user: Array.isArray((requestItem as any).user) ? (requestItem as any).user[0] : (requestItem as any).user,
    comments: ((requestItem as any).comments ?? []).map((comment: any) => ({
      ...comment,
      user: Array.isArray(comment.user) ? comment.user[0] : comment.user,
    })),
  };

  return (
    <UserLayout>
      <div className="mx-auto max-w-5xl animate-fade-in">
        <RequestDetailClient requestItem={normalizedRequest as any} currentUserId={user.id} />
      </div>
    </UserLayout>
  );
}
