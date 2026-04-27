import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/admin-audit';
import { insertCashboxEntry } from '@/lib/cashbox';
import { isMissingItemEnhancementColumns } from '@/lib/item-select';

async function fetchStockTarget(client: any, itemId: string) {
  const enhancedQuery = await client
    .from('items')
    .select('stock, name, is_unlimited_stock')
    .eq('id', itemId)
    .single();

  if (!isMissingItemEnhancementColumns(enhancedQuery.error)) {
    return enhancedQuery;
  }

  const legacyQuery = await client
    .from('items')
    .select('stock, name')
    .eq('id', itemId)
    .single();

  return {
    ...legacyQuery,
    data: legacyQuery.data
      ? {
          ...legacyQuery.data,
          is_unlimited_stock: false,
        }
      : legacyQuery.data,
  };
}

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();
  const { item_id, quantity, note, purchase } = await request.json();

  if (!item_id || !quantity || quantity <= 0) {
    return NextResponse.json({ error: '無効なリクエストです' }, { status: 400 });
  }

  const { data: item } = await fetchStockTarget(supabase, item_id);

  if (!item) return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 });
  if (item.is_unlimited_stock) {
    return NextResponse.json(
      { error: '在庫管理なしの商品には在庫追加できません' },
      { status: 400 }
    );
  }

  let purchaseSummary: Record<string, unknown> | null = null;
  let normalizedPurchase:
    | {
        paymentSource: 'cashbox' | 'personal_advance';
        unitPrice: number;
        vendor: string | null;
        purchaseNote: string | null;
        totalAmount: number;
        reimbursementStatus: 'not_needed' | 'pending_reimbursement';
      }
    | null = null;

  if (purchase?.record) {
    const paymentSource = purchase.payment_source;
    const totalAmount = Number(purchase.total_amount);
    const vendor = purchase.vendor?.trim() || null;
    const purchaseNote = purchase.note?.trim() || null;

    if (!['cashbox', 'personal_advance'].includes(paymentSource)) {
      return NextResponse.json({ error: '支払い元が不正です' }, { status: 400 });
    }

    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return NextResponse.json({ error: '仕入れ合計額を入力してください' }, { status: 400 });
    }

    const unitPrice = Number(quantity) > 0 ? Math.round(totalAmount / Number(quantity)) : 0;

    normalizedPurchase = {
      paymentSource,
      unitPrice,
      vendor,
      purchaseNote,
      totalAmount,
      reimbursementStatus: paymentSource === 'cashbox' ? 'not_needed' : 'pending_reimbursement',
    };
  }

  const { error } = await supabase
    .from('items')
    .update({ stock: item.stock + quantity })
    .eq('id', item_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('stock_history').insert({
    item_id,
    change_amount: quantity,
    reason: 'restock',
    note: note ?? '入荷',
    created_by: user?.id ?? null,
  });

  if (normalizedPurchase) {
    const { data: purchaseRun, error: purchaseRunError } = await supabase
      .from('purchase_runs')
      .insert({
        total_amount: normalizedPurchase.totalAmount,
        payment_source: normalizedPurchase.paymentSource,
        reimbursement_status: normalizedPurchase.reimbursementStatus,
        vendor: normalizedPurchase.vendor,
        note: normalizedPurchase.purchaseNote,
        purchased_by: user?.id ?? null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (purchaseRunError || !purchaseRun) {
      return NextResponse.json({ error: purchaseRunError?.message ?? '仕入れ記録に失敗しました' }, { status: 500 });
    }

    const { error: purchaseItemError } = await supabase.from('purchase_run_items').insert({
      purchase_run_id: purchaseRun.id,
      item_id,
      item_name: item.name,
      quantity: Number(quantity),
      unit_price: normalizedPurchase.unitPrice,
      subtotal: normalizedPurchase.totalAmount,
    });

    if (purchaseItemError) {
      return NextResponse.json({ error: purchaseItemError.message }, { status: 500 });
    }

    if (normalizedPurchase.paymentSource === 'cashbox') {
      await insertCashboxEntry(supabase, {
        entry_type: 'restock_cash_out',
        direction: 'out',
        amount: normalizedPurchase.totalAmount,
        purchase_run_id: purchaseRun.id,
        note:
          normalizedPurchase.purchaseNote ??
          `仕入れ: ${item.name}${normalizedPurchase.vendor ? ` / ${normalizedPurchase.vendor}` : ''}`,
        created_by: user?.id ?? null,
      });
    }

    purchaseSummary = {
      payment_source: normalizedPurchase.paymentSource,
      vendor: normalizedPurchase.vendor,
      unit_price: normalizedPurchase.unitPrice,
      total_amount: normalizedPurchase.totalAmount,
      reimbursement_status: normalizedPurchase.reimbursementStatus,
      purchase_run_id: purchaseRun.id,
      note: normalizedPurchase.purchaseNote,
    };
  }

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: 'stock_restocked',
    target_type: 'item',
    target_id: item_id,
    summary: purchaseSummary
      ? `${item.name} を ${Number(quantity).toLocaleString()} 個入荷し、仕入れ記録を追加しました`
      : `在庫を ${Number(quantity).toLocaleString()} 個追加しました`,
    metadata: {
      quantity: Number(quantity),
      note: note ?? '入荷',
      purchase: purchaseSummary,
    },
  });

  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/items');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true, purchase: purchaseSummary });
}
