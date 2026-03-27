import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('users')
    .update({ is_approved: true })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
