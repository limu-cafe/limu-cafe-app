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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const { name, multiplier, starts_at, ends_at, is_enabled, apply_immediately, note } =
    await request.json();

  const payload: Record<string, unknown> = {
    updated_by: adminSession.user.id,
  };

  if (typeof name === 'string') payload.name = name.trim();
  if (typeof multiplier === 'number' && Number.isFinite(multiplier)) payload.multiplier = multiplier;
  if (typeof is_enabled === 'boolean') payload.is_enabled = is_enabled;
  if (typeof apply_immediately === 'boolean') payload.apply_immediately = apply_immediately;
  if (note !== undefined) payload.note = typeof note === 'string' && note.trim().length > 0 ? note.trim() : null;
  if (starts_at !== undefined) payload.starts_at = normalizeDateTime(starts_at);
  if (ends_at !== undefined) payload.ends_at = normalizeDateTime(ends_at);

  const supabase = createAdminClient();
  const { error } = await supabase.from('point_campaigns').update(payload).eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/admin/points');
  revalidatePath('/admin/operations');

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('point_campaigns').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/admin/points');
  revalidatePath('/admin/operations');

  return NextResponse.json({ ok: true });
}
