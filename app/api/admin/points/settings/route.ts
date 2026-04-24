import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const { is_enabled, base_points_per_unit, yen_per_point_unit } = await request.json();

  if (typeof is_enabled !== 'boolean') {
    return NextResponse.json({ error: 'ポイント設定の有効/無効が不正です' }, { status: 400 });
  }

  if (!Number.isInteger(base_points_per_unit) || base_points_per_unit < 1 || base_points_per_unit > 100) {
    return NextResponse.json({ error: '付与ポイント数は1〜100で指定してください' }, { status: 400 });
  }

  if (!Number.isInteger(yen_per_point_unit) || yen_per_point_unit < 1 || yen_per_point_unit > 100000) {
    return NextResponse.json({ error: 'ポイント付与の基準金額が不正です' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('point_settings').upsert({
    singleton: 'default',
    is_enabled,
    base_points_per_unit,
    yen_per_point_unit,
    updated_by: adminSession.user.id,
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
