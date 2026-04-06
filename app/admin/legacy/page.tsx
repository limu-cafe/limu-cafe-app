import { createAdminClient } from '@/lib/supabase/server';
import LegacyTransferClient from './LegacyTransferClient';

export const dynamic = 'force-dynamic';

type PurchaseRow = {
  legacy_user_id: string;
  item_name: string;
  quantity: number;
};

type PurchaseSummary = {
  totalQuantity: number;
  topItems: string[];
};

export default async function AdminLegacyPage() {
  const supabase = createAdminClient();

  const [{ data: requests }, { data: legacyUsers }, { data: purchaseRows }] = await Promise.all([
    supabase
      .from('legacy_transfer_requests')
      .select('*, user:users!legacy_transfer_requests_user_id_fkey(name, email), matched_legacy_user:legacy_users(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('legacy_users')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('legacy_purchase_history')
      .select('legacy_user_id, item_name, quantity'),
  ]);

  const purchaseSummaries = ((purchaseRows ?? []) as PurchaseRow[]).reduce<Record<string, PurchaseSummary>>(
    (acc: Record<string, PurchaseSummary>, row) => {
      const current = acc[row.legacy_user_id] ?? { totalQuantity: 0, topItems: [] };
      current.totalQuantity += row.quantity;
      if (current.topItems.length < 3 && !current.topItems.includes(row.item_name)) {
        current.topItems.push(row.item_name);
      }
      acc[row.legacy_user_id] = current;
      return acc;
    },
    {}
  );

  return (
    <LegacyTransferClient
      requests={requests ?? []}
      legacyUsers={(legacyUsers ?? []).map((legacyUser: any) => ({
        ...legacyUser,
        purchase_summary: purchaseSummaries[legacyUser.id] ?? { totalQuantity: 0, topItems: [] },
      }))}
    />
  );
}
