import { requireAdminSession } from '@/lib/admin-session';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  const adminAccess = await requireAdminSession();
  if (!adminAccess.user) return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('price_watches')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const adminAccess = await requireAdminSession();
  if (!adminAccess.user) return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });

  const supabase = createAdminClient();

  const body = await request.json();

  const { data, error } = await supabase
    .from('price_watches')
    .insert({ ...body, created_by: null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/admin/price-watch');

  return NextResponse.json(data);
}
