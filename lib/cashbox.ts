import type { SupabaseClient } from '@supabase/supabase-js';

export type CashboxDirection = 'in' | 'out';
export type CashboxEntryType =
  | 'cash_order'
  | 'cash_charge'
  | 'cash_settlement'
  | 'manual_in'
  | 'manual_out';

type CashboxBalanceRow = {
  amount: number;
  direction: CashboxDirection;
};

type InsertCashboxEntryInput = {
  entry_type: CashboxEntryType;
  direction: CashboxDirection;
  amount: number;
  note?: string | null;
  order_id?: string | null;
  charge_request_id?: string | null;
  settlement_id?: string | null;
  created_by?: string | null;
};

export function calculateCashboxBalance(rows: CashboxBalanceRow[]) {
  return rows.reduce((sum, row) => {
    return sum + (row.direction === 'in' ? row.amount : -row.amount);
  }, 0);
}

export async function getCashboxExpectedBalance(supabase: SupabaseClient<any, any, any>) {
  const { data, error } = await supabase
    .from('cashbox_entries')
    .select('amount, direction');

  if (error) {
    throw error;
  }

  return calculateCashboxBalance((data ?? []) as CashboxBalanceRow[]);
}

export async function insertCashboxEntry(
  supabase: SupabaseClient<any, any, any>,
  input: InsertCashboxEntryInput
) {
  const { error } = await supabase.from('cashbox_entries').insert(input);

  if (error && error.code !== '23505') {
    throw error;
  }
}

export const cashboxEntryLabels: Record<CashboxEntryType, string> = {
  cash_order: '現金注文',
  cash_charge: '現金チャージ承認',
  cash_settlement: '現金精算',
  manual_in: '手動入金',
  manual_out: '手動出金',
};
