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
  const fetchLimit = limit + 1;

  const { data: chargeRequests, error } = await supabase
    .from('charge_requests')
    .select('id, amount, method, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchLimit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = chargeRequests ?? [];
  return NextResponse.json({
    chargeRequests: rows.slice(0, limit),
    hasMore: rows.length > limit,
  });
}
