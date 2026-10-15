import { requireAdminSession } from '@/lib/admin-session';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { loadItemDisplayOrder } from '@/lib/item-order-server';
import { sortItemsByDisplayOrder } from '@/lib/item-order';
import { ProductCreation } from '@/lib/domain/product';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('items')
    .select('*, category:categories(*)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const displayOrder = await loadItemDisplayOrder(supabase);
    return NextResponse.json(sortItemsByDisplayOrder(data ?? [], displayOrder.itemIds));
  } catch {
    return NextResponse.json({ error: '商品一覧を取得できませんでした' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const adminAccess = await requireAdminSession();
  if (!adminAccess.user) return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });

  const supabase = createAdminClient();
  const body = await request.json().catch(() => null);
  let change: ProductCreation;
  try {
    change = new ProductCreation(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '商品情報が不正です' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('items')
    .insert({ ...change.patch, stock: change.initialStock })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/');
  revalidatePath('/admin/items');
  revalidatePath('/admin/stock');

  return NextResponse.json(data);
}
