import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getCashboxExpectedBalance } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();
  const { actual_amount, note, denomination_counts } = await request.json();

  const normalizedCounts =
    denomination_counts && typeof denomination_counts === 'object'
      ? Object.entries(denomination_counts).reduce<Record<string, number>>((acc, [key, value]) => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0) return acc;
          acc[key] = Math.floor(parsed);
          return acc;
        }, {})
      : {};

  const calculatedAmount = Object.entries(normalizedCounts).reduce((sum, [denomination, count]) => {
    return sum + Number(denomination) * count;
  }, 0);

  const finalActualAmount =
    Object.keys(normalizedCounts).length > 0 ? calculatedAmount : Number(actual_amount);

  if (!Number.isFinite(finalActualAmount) || finalActualAmount < 0) {
    return NextResponse.json({ error: '実測金額を入力してください' }, { status: 400 });
  }

  const expectedAmount = await getCashboxExpectedBalance(supabase);
  const differenceAmount = finalActualAmount - expectedAmount;
  const denominationNote =
    Object.keys(normalizedCounts).length > 0
      ? `内訳: ${Object.entries(normalizedCounts)
          .filter(([, count]) => count > 0)
          .map(([denomination, count]) => `${Number(denomination).toLocaleString()}円×${count}`)
          .join(', ')}`
      : null;
  const mergedNote = [note?.trim() || null, denominationNote].filter(Boolean).join(' / ') || null;

  const { error } = await supabase.from('cashbox_counts').insert({
    actual_amount: finalActualAmount,
    expected_amount: expectedAmount,
    difference_amount: differenceAmount,
    note: mergedNote,
    counted_by: user?.id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: 'cashbox_count_recorded',
    target_type: 'cashbox_count',
    summary: `実測 ${Number(finalActualAmount).toLocaleString()}円 / 差額 ${differenceAmount.toLocaleString()}円 を記録しました`,
    metadata: {
      actual_amount: Number(finalActualAmount),
      expected_amount: expectedAmount,
      difference_amount: differenceAmount,
      note: mergedNote,
      denomination_counts: normalizedCounts,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
