import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';

function normalizeDateTime(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function POST(request: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const { name, multiplier, starts_at, ends_at, is_enabled, apply_immediately, note } =
    await request.json();

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'キャンペーン名を入力してください' }, { status: 400 });
  }

  if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0) {
    return NextResponse.json({ error: '倍率は0より大きい数値で指定してください' }, { status: 400 });
  }

  const normalizedStartsAt = normalizeDateTime(starts_at);
  const normalizedEndsAt = normalizeDateTime(ends_at);

  const supabase = createAdminClient();
  const { error } = await supabase.from('point_campaigns').insert({
    name: name.trim(),
    multiplier,
    starts_at: normalizedStartsAt,
    ends_at: normalizedEndsAt,
    is_enabled: typeof is_enabled === 'boolean' ? is_enabled : true,
    apply_immediately: Boolean(apply_immediately),
    note: typeof note === 'string' && note.trim().length > 0 ? note.trim() : null,
    created_by: adminSession.user.id,
    updated_by: adminSession.user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/admin/points');
  revalidatePath('/admin/operations');

  return NextResponse.json({ ok: true });
}
