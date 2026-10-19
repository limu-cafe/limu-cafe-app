import { requireAdminSession } from '@/lib/admin-session';
import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { paymentFailure, refreshPaymentViews } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminSession();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: '不正な送信元です' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!isObjectId(params.id) || !Number.isSafeInteger(body?.amount) || body.amount <= 0 || body.amount > 2147483647) return NextResponse.json({ error: '追加額を確認してください' }, { status: 400 });
  const { error } = await createAdminClient().rpc('add_user_wallet_balance', { p_user_id: params.id, p_amount: body.amount });
  if (error) return paymentFailure(error);
  refreshPaymentViews();
  return NextResponse.json({ ok: true });
}
