import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number(searchParams.get('offset') ?? '0'));
  const limit = Math.min(10, Math.max(1, Number(searchParams.get('limit') ?? '3')));

  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, total_amount, payment_method, payment_status, created_at, order_items(item_name, quantity, item:items(id, name, price, stock, is_available, stock_alert_threshold, category_id, image_url, description, popular_override, new_arrival_override, created_at, updated_at))'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: orders ?? [] });
}
