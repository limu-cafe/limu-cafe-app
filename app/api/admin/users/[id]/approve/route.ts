import { requireAdminSession } from '@/lib/admin-session';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const adminAccess = await requireAdminSession();
  if (!adminAccess.user) return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });

  const supabase = createAdminClient();

  const { error } = await supabase
    .from('users')
    .update({ is_approved: true })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/admin/users');

  return NextResponse.json({ ok: true });
}
