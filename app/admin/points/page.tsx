import { createAdminClient } from '@/lib/supabase/server';
import PointsClient from './PointsClient';
import { DEFAULT_POINT_SETTINGS } from '@/lib/points';

export const dynamic = 'force-dynamic';

export default async function AdminPointsPage() {
  const supabase = createAdminClient();

  const [{ data: settings }, { data: campaigns }, { data: users }, { data: transactions }] =
    await Promise.all([
      supabase.from('point_settings').select('*').eq('singleton', 'default').maybeSingle(),
      supabase.from('point_campaigns').select('*').order('created_at', { ascending: false }).limit(20),
      supabase
        .from('users')
        .select('id, name, email, points_balance, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('point_transactions')
        .select('*, user:users!point_transactions_user_id_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

  return (
    <PointsClient
      settings={(settings as any) ?? DEFAULT_POINT_SETTINGS}
      campaigns={(campaigns ?? []) as any[]}
      users={(users ?? []) as any[]}
      transactions={(transactions ?? []) as any[]}
    />
  );
}
