import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import { AdminObjectReadRepository } from '@/lib/admin-object-queries';
import OrderDetailClient from './OrderDetailClient';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({ params: pendingParams, searchParams: pendingSearch }: { params: Promise<{ id: string }>; searchParams?: Promise<{ from?: string }> }) {
  const params = await pendingParams;
  const searchParams = (await pendingSearch) ?? {};
  await requireAdminPage();
  const db = createAdminClient();
  const order = await new AdminObjectReadRepository(db).order(params.id);
  if (!order) notFound();
  const { data: balancePayment, error } = await db.from('order_balance_payments').select('amount, original_payment_method, balance_before, balance_after, reason, created_at').eq('order_id', params.id).maybeSingle();
  if (error) throw error;
  // Only known collection pages can be used as a return destination.
  const from = typeof searchParams.from === 'string' && /^\/admin\/(items|users|transactions|cashbox)(\?[^#]*)?$/.test(searchParams.from) ? searchParams.from : '/admin/transactions';
  return <OrderDetailClient order={order} returnTo={from} balancePayment={balancePayment}/>;
}
