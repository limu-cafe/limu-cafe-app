import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireVerifiedAdminSession } from '@/lib/admin-session';
import { parseItemOrderInput } from '@/lib/item-order';
import { isMissingItemOrderSchema } from '@/lib/item-order-server';

export async function PUT(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 403 });
  }
  const session = await requireVerifiedAdminSession();
  if (session.error || !session.user) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  const input = parseItemOrderInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: '商品一覧または更新情報が不正です' }, { status: 400 });

  const { data, error } = await createAdminClient().rpc('save_item_display_order', {
    p_item_ids: input.itemIds,
    p_expected_revision: input.expectedRevision,
    p_actor_id: session.user.id,
  });
  if (error) {
    if (error.code === '40001') {
      return NextResponse.json({ error: '商品または表示順が更新されています。再読み込みして確認してください' }, { status: 409 });
    }
    if (isMissingItemOrderSchema(error)) {
      return NextResponse.json({ error: '表示順の保存を現在利用できません' }, { status: 503 });
    }
    console.error('failed to save item display order', error);
    return NextResponse.json({ error: '表示順を保存できませんでした' }, { status: 500 });
  }
  revalidatePath('/');
  revalidatePath('/api/items');
  revalidatePath('/admin/items');
  revalidatePath('/admin/audit');
  return NextResponse.json({ revision: data });
}
