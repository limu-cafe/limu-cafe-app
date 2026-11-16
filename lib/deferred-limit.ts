// The ceiling itself lives in the database (public.deferred_balance_limit()).
// These helpers only shape what the screens show; the database makes the decision.
const yen = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

export type DeferredAllowance = { limit: number; deferred_balance: number; remaining: number };

export function deferredAllowance(limit: unknown, deferredBalance: unknown): DeferredAllowance | null {
  if (!yen(limit) || !yen(deferredBalance) || limit < 0) return null;
  return { limit, deferred_balance: deferredBalance, remaining: Math.max(0, limit - deferredBalance) };
}

/** Reads the detail that check_deferred_limit attaches to an LM001 error. */
export function parseDeferredLimitDetail(details: unknown): { limit: number; remaining: number } | null {
  if (typeof details !== 'string') return null;
  try {
    const detail = JSON.parse(details);
    if (!detail || !yen(detail.limit) || !yen(detail.remaining) || detail.remaining < 0) return null;
    return { limit: detail.limit, remaining: detail.remaining };
  } catch {
    return null;
  }
}
