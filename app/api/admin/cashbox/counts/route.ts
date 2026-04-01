import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getCashboxExpectedBalance } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();
  const { actual_amount, note } = await request.json();

  if (actual_amount === undefined || actual_amount === null || actual_amount < 0) {
    return NextResponse.json({ error: '実測金額を入力してください' }, { status: 400 });
  }

  const expectedAmount = await getCashboxExpectedBalance(supabase);
  const differenceAmount = actual_amount - expectedAmount;

  const { error } = await supabase.from('cashbox_counts').insert({
    actual_amount,
    expected_amount: expectedAmount,
    difference_amount: differenceAmount,
    note: note?.trim() || null,
    counted_by: user?.id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: 'cashbox_count_recorded',
    target_type: 'cashbox_count',
    summary: `実測 ${Number(actual_amount).toLocaleString()}円 / 差額 ${differenceAmount.toLocaleString()}円 を記録しました`,
    metadata: {
      actual_amount: Number(actual_amount),
      expected_amount: expectedAmount,
      difference_amount: differenceAmount,
      note: note?.trim() || null,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
