import { requireAdminSession } from '@/lib/admin-session';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { parseRestockInput, validRestockRequestId } from '@/lib/restock';

export async function POST(request: Request) {
  const access = await requireAdminSession();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: '不正な送信元です' }, { status: 403 });
  const body = await request.json().catch(() => null);
  let input;
  try { input = parseRestockInput(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '入荷情報が不正です' }, { status: 400 }); }
  const requestId = body.request_id;
  if (!validRestockRequestId(requestId)) return NextResponse.json({ error: '画面を再読み込みしてから在庫を追加してください' }, { status: 400 });
  const { data, error } = await createAdminClient().rpc('record_stock_restock', {
    p_request_id: requestId, p_item_id: input.item_id, p_quantity: input.quantity,
    p_note: input.note, p_purchase: input.purchase, p_actor_id: access.user.id,
  });
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code)) return NextResponse.json({ error: '安全な在庫追加の準備ができていません。管理者に確認してください' }, { status: 503 });
    if (error.code === 'P0002') return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 });
    if (['22023', '22003', '23514'].includes(error.code)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('atomic restock failed', { code: error.code });
    return NextResponse.json({ error: '入荷を保存できませんでした。同じ内容で再試行できます' }, { status: 500 });
  }
  if (!data?.ok) return NextResponse.json({ error: '入荷の保存結果を確認できませんでした。同じ内容で再試行してください' }, { status: 500 });
  for (const path of ['/', '/admin', '/admin/stock', '/admin/items', '/admin/cashbox', '/admin/reimbursements', '/admin/audit']) revalidatePath(path);
  return NextResponse.json(data);
}
