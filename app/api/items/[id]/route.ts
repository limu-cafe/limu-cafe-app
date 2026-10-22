import { requireAdminSession } from '@/lib/admin-session';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ProductDetailsChange } from '@/lib/domain/product';

export async function PUT(
  request: Request,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const adminAccess = await requireAdminSession();
  if (!adminAccess.user) return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });

  const supabase = createAdminClient();
  const body = await request.json().catch(() => null);
  let change: ProductDetailsChange;
  try { change = new ProductDetailsChange(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '商品情報が不正です' }, { status: 400 }); }

  let query = supabase
    .from('items')
    .update({ ...change.patch, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (change.expectedUpdatedAt) query = query.eq('updated_at', change.expectedUpdatedAt);
  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '商品が更新されています。再読み込みして確認してください' }, { status: 409 });

  revalidatePath('/');
  revalidatePath('/admin/items');
  revalidatePath('/admin/stock');

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const adminAccess = await requireAdminSession();
  if (!adminAccess.user) return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });

  const supabase = createAdminClient();
  const { error } = await supabase.from('items').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.code === '23503' ? '取引に使われた商品は削除できません。非表示をご利用ください' : error.message }, { status: error.code === '23503' ? 409 : 500 });

  revalidatePath('/');
  revalidatePath('/admin/items');
  revalidatePath('/admin/stock');

  return NextResponse.json({ ok: true });
}
