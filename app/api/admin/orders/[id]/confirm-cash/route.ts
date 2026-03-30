import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('orders')
    .update({
      payment_status: 'completed',
      cash_confirmed_at: new Date().toISOString(),
      cash_confirmed_by: user?.id ?? null,
    })
    .eq('id', params.id)
    .eq('payment_method', 'cash')
    .select('id, total_amount')
    .single();

  if (error || !order) return NextResponse.json({ error: error?.message ?? '注文が見つかりません' }, { status: 500 });

  await insertCashboxEntry(supabase, {
    entry_type: 'cash_order',
    direction: 'in',
    amount: order.total_amount,
    note: '現金払い注文の受領確認',
    order_id: order.id,
    created_by: user?.id ?? null,
  });

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/cashbox');

  return NextResponse.json({ ok: true });
}
