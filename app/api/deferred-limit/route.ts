import { requireMemberSession } from '@/lib/member-session';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { deferredAllowance } from '@/lib/deferred-limit';

// How much more the signed-in member can add to the unsettled debt (top-ups plus
// deferred orders). Display only: checkout_order and the charge RPC enforce the ceiling.
export async function GET() {
  const memberAccess = await requireMemberSession();
  const user = memberAccess.user;
  if (!user) return NextResponse.json({ error: memberAccess.error }, { status: memberAccess.status });

  const db = createAdminClient();
  const [limit, profile] = await Promise.all([
    db.rpc('deferred_balance_limit'),
    db.from('users').select('deferred_balance').eq('id', user.id).single(),
  ]);
  const allowance = limit.error || profile.error ? null : deferredAllowance(limit.data, profile.data?.deferred_balance);
  if (!allowance) {
    console.error('[deferred-limit] lookup failed', { limit: limit.error?.code, profile: profile.error?.code });
    return NextResponse.json({ error: '後払いの残りの枠を確認できませんでした' }, { status: 500 });
  }
  return NextResponse.json(allowance, { headers: { 'Cache-Control': 'no-store' } });
}
