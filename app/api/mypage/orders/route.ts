import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  isMissingDeferredSettlementMethodColumn,
  ORDERS_SELECT_LEGACY,
  ORDERS_SELECT_WITH_DEFERRED,
} from '@/lib/orders';

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
  const fetchLimit = limit + 1;

  let orderQuery: any = await supabase
    .from('orders')
    .select(ORDERS_SELECT_WITH_DEFERRED)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchLimit - 1);

  if (isMissingDeferredSettlementMethodColumn(orderQuery.error)) {
    orderQuery = await supabase
      .from('orders')
      .select(ORDERS_SELECT_LEGACY)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + fetchLimit - 1);
  }

  const { data: orders, error } = orderQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = orders ?? [];
  return NextResponse.json({
    orders: rows.slice(0, limit),
    hasMore: rows.length > limit,
  });
}
