export type CashChargeSettlementRow = {
  charge_request_id: string | null;
};

export type CashChargeSummary = {
  id: string;
  method: string;
  status: string;
};

export function buildSettledChargeIdSet(rows: CashChargeSettlementRow[]) {
  return new Set(
    rows
      .map((row) => row.charge_request_id)
      .filter((value): value is string => Boolean(value))
  );
}

export function isPendingCashChargeSettlement(
  charge: CashChargeSummary,
  settledChargeIds: Set<string>
) {
  return (
    charge.method === 'cash' &&
    charge.status === 'approved' &&
    !settledChargeIds.has(charge.id)
  );
}
