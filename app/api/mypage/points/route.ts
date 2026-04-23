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
  const limit = Math.min(10, Math.max(1, Number(searchParams.get('limit') ?? '5')));
  const fetchLimit = limit + 1;

  const { data, error } = await supabase
    .from('point_transactions')
    .select('id, delta, balance_after, reason_type, note, created_at, charge_request_id, order_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchLimit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  return NextResponse.json({
    pointTransactions: rows.slice(0, limit),
    hasMore: rows.length > limit,
  });
}
