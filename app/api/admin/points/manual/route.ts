import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const { user_id, delta, note } = await request.json();

  if (typeof user_id !== 'string' || user_id.length === 0) {
    return NextResponse.json({ error: '対象ユーザーが不正です' }, { status: 400 });
  }

  if (!Number.isInteger(delta) || delta === 0) {
    return NextResponse.json({ error: 'ポイント増減量は0以外の整数で指定してください' }, { status: 400 });
  }

  if (typeof note !== 'string' || note.trim().length === 0) {
    return NextResponse.json({ error: '理由メモを入力してください' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const reasonType = delta > 0 ? 'manual_grant' : 'manual_deduct';

  const { error } = await supabase.rpc('record_point_transaction', {
    p_user_id: user_id,
    p_delta: delta,
    p_reason_type: reasonType,
    p_charge_request_id: null,
    p_order_id: null,
    p_note: note.trim(),
    p_created_by: adminSession.user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/admin/points');
  revalidatePath('/admin/users');
  revalidatePath('/admin/operations');
  revalidatePath('/mypage');

  return NextResponse.json({ ok: true });
}
