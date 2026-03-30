import { createAdminClient } from '@/lib/supabase/server';
import { calculateCashboxBalance } from '@/lib/cashbox';
import CashboxClient from './CashboxClient';

export const dynamic = 'force-dynamic';

export default async function CashboxPage() {
  const supabase = createAdminClient();

  const [
    { data: balanceRows },
    { data: entries },
    { data: counts },
    { data: backfillRuns },
    { count: manualEntryCount },
  ] = await Promise.all([
    supabase
      .from('cashbox_entries')
      .select('amount, direction'),
    supabase
      .from('cashbox_entries')
      .select('*, created_by_user:users!cashbox_entries_created_by_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('cashbox_counts')
      .select('*, counted_by_user:users!cashbox_counts_counted_by_fkey(name)')
      .order('counted_at', { ascending: false })
      .limit(20),
    supabase
      .from('cashbox_backfill_runs')
      .select('*')
      .order('ran_at', { ascending: false })
      .limit(1),
    supabase
      .from('cashbox_entries')
      .select('*', { count: 'exact', head: true })
      .in('entry_type', ['manual_in', 'manual_out']),
  ]);

  const expectedAmount = calculateCashboxBalance((balanceRows ?? []) as { amount: number; direction: 'in' | 'out' }[]);
  const latestCount = counts?.[0] ?? null;
  const latestBackfillRun = backfillRuns?.[0] ?? null;

  return (
    <CashboxClient
      expectedAmount={expectedAmount}
      latestCount={latestCount}
      entries={entries ?? []}
      counts={counts ?? []}
      latestBackfillRun={latestBackfillRun}
      hasLegacyBaseline={Boolean((manualEntryCount ?? 0) > 0)}
    />
  );
}
