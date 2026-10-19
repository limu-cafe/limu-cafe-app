import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/admin-session';
import { createAdminClient } from '@/lib/supabase/server';
import { isObjectId } from '@/lib/admin-objects';

export const paymentViews = ['/', '/mypage', '/admin', '/admin/orders', '/admin/transactions', '/admin/users', '/admin/charge', '/admin/settlement', '/admin/cashbox', '/admin/audit'];
export function refreshPaymentViews(orderId?: string) {
  for (const path of paymentViews) revalidatePath(path);
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
}
export function paymentFailure(error: { code?: string; message?: string }) {
  const code = error.code ?? '';
  if (['PGRST202','42883','42P01','42703'].includes(code)) return NextResponse.json({ error: '安全な精算機能の準備ができていません。管理者に確認してください' }, { status: 503 });
  if (['P0001','22023','P0002','42501'].includes(code)) return NextResponse.json({ error: error.message }, { status: ({ P0001: 409, '22023': 400, P0002: 404, '42501': 403 } as Record<string, number>)[code] });
  console.error('payment operation failed', { code });
  return NextResponse.json({ error: '精算結果を確認できませんでした。履歴を再読み込みしてください' }, { status: 500 });
}
export async function runAdminPayment(request: Request, rpc: string, input: (actorId: string) => Promise<Record<string, unknown>>) {
  const access = await requireAdminSession();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: '不正な送信元です' }, { status: 403 });
  let params;
  try { params = await input(access.user.id); }
  catch { return NextResponse.json({ error: '精算内容を確認してください' }, { status: 400 }); }
  const { data, error } = await createAdminClient().rpc(rpc, params);
  if (error) return paymentFailure(error);
  if (!data?.ok) return paymentFailure({});
  refreshPaymentViews(typeof params.p_order_id === 'string' ? params.p_order_id : typeof params.p_target_id === 'string' && params.p_kind !== 'cash_charge' ? params.p_target_id : undefined);
  if (Array.isArray(params.p_orders)) for (const entry of params.p_orders as { id: string }[]) revalidatePath(`/admin/orders/${entry.id}`);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export function cashCollection(request: Request, id: string, kind: 'cash_order' | 'deferred_order' | 'cash_charge', reverse: boolean) {
  return runAdminPayment(request, 'record_cash_collection', async (actor) => {
    if (!isObjectId(id)) throw new Error('invalid id');
    return { p_kind: kind, p_target_id: id, p_reverse: reverse, p_actor_id: actor };
  });
}
