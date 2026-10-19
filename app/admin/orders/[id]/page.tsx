import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import { AdminObjectReadRepository } from '@/lib/admin-object-queries';
import OrderDetailClient from './OrderDetailClient';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { from?: string } }) {
  await requireAdminPage();
  const order = await new AdminObjectReadRepository(createAdminClient()).order(params.id);
  if (!order) notFound();
  // Only known collection pages can be used as a return destination.
  const from = typeof searchParams.from === 'string' && /^\/admin\/(items|users|transactions|cashbox)(\?[^#]*)?$/.test(searchParams.from) ? searchParams.from : '/admin/transactions';
  return <OrderDetailClient order={order} returnTo={from}/>;
}
