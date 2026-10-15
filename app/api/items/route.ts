import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { loadItemDisplayOrder } from '@/lib/item-order-server';
import { sortItemsByDisplayOrder } from '@/lib/item-order';

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
  const supabase = createAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from('items')
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/');
  revalidatePath('/admin/items');
  revalidatePath('/admin/stock');

  return NextResponse.json(data);
}
