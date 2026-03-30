import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: 'completed',
      cash_confirmed_at: new Date().toISOString(),
      cash_confirmed_by: null,
    })
    .eq('id', params.id)
    .eq('payment_method', 'cash');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/admin/orders');

  return NextResponse.json({ ok: true });
}
