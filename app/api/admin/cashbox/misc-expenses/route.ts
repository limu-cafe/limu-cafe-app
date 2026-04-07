import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  const { amount, item_name, note } = await request.json();

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: '金額を入力してください' }, { status: 400 });
  }

  if (typeof item_name !== 'string' || !item_name.trim()) {
    return NextResponse.json({ error: '雑費名を入力してください' }, { status: 400 });
  }

  const itemName = item_name.trim();
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  const summaryNote = trimmedNote ? `${itemName} / ${trimmedNote}` : itemName;
  const supabase = createAdminClient();

  await insertCashboxEntry(supabase, {
    entry_type: 'misc_expense',
    direction: 'out',
    amount,
    note: summaryNote,
    created_by: user?.id ?? null,
  });

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: 'cashbox_misc_expense_created',
    target_type: 'cashbox_entry',
    summary: `雑費 ${itemName} を ${Number(amount).toLocaleString()}円で記録しました`,
    metadata: {
      amount: Number(amount),
      item_name: itemName,
      note: trimmedNote || null,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
