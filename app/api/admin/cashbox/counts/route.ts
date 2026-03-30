import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getCashboxExpectedBalance } from '@/lib/cashbox';

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

  revalidatePath('/admin');
  revalidatePath('/admin/cashbox');

  return NextResponse.json({ ok: true });
}
