import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-session';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/transaction-history';

/** Loaded only when recording an advance on somebody else's behalf. */
export async function GET() {
  const access = await requireAdminSession();
  if (!access.user) return NextResponse.json({error:access.error},{status:access.status});
  try {
    const db = createAdminClient();
    const users = await fetchAllRows<{id:string;name:string}>((from,to)=>db.from('users').select('id,name',{count:'exact'}).eq('is_active',true).eq('is_approved',true).order('name').order('id').range(from,to));
    return NextResponse.json({users},{headers:{'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'立替者を読み込めませんでした'},{status:500}); }
}
