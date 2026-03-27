import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: 'completed',
      cash_confirmed_at: new Date().toISOString(),
      cash_confirmed_by: user.id,
    })
    .eq('id', params.id)
    .eq('payment_method', 'cash');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
