import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();
  const { amount, direction, note } = await request.json();

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: '金額を入力してください' }, { status: 400 });
  }

  if (!['in', 'out'].includes(direction)) {
    return NextResponse.json({ error: '入出金区分が不正です' }, { status: 400 });
  }

  await insertCashboxEntry(supabase, {
    entry_type: direction === 'in' ? 'manual_in' : 'manual_out',
    direction,
    amount,
    note: note?.trim() || null,
    created_by: user?.id ?? null,
  });

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: direction === 'in' ? 'cashbox_manual_in' : 'cashbox_manual_out',
    target_type: 'cashbox_entry',
    summary: `金庫へ ${direction === 'in' ? '入金' : '出金'} ${Number(amount).toLocaleString()}円`,
    metadata: {
      direction,
      amount: Number(amount),
      note: note?.trim() || null,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
