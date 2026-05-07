type BaseUserRow = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
};

export type DeferredCashCollectionRow = BaseUserRow & {
  deferred_balance: number;
};

export type PendingCashOrderRow = {
  user_id: string;
  total_amount: number;
  user?: BaseUserRow | null;
};

export type PendingSubscriptionCashRow = {
  user_id: string;
  cash_due_amount: number;
  user?: BaseUserRow | null;
};

export type CashCollectionEntry = {
  userId: string;
  name: string;
  avatar_url?: string | null;
  deferredAmount: number;
  cashOrderAmount: number;
  subscriptionCashAmount: number;
  totalAmount: number;
};

function getOrCreateEntry(
  map: Map<string, CashCollectionEntry>,
  userId: string,
  fallback?: BaseUserRow | null
) {
  const existing = map.get(userId);
  if (existing) {
    if ((!existing.name || existing.name === '不明なユーザー') && fallback?.name) {
      existing.name = fallback.name;
    }
    if (!existing.avatar_url && fallback?.avatar_url) {
      existing.avatar_url = fallback.avatar_url;
    }
    return existing;
  }

  const created: CashCollectionEntry = {
    userId,
    name: fallback?.name ?? '不明なユーザー',
    avatar_url: fallback?.avatar_url ?? null,
    deferredAmount: 0,
    cashOrderAmount: 0,
    subscriptionCashAmount: 0,
    totalAmount: 0,
  };
  map.set(userId, created);
  return created;
}

export function buildCashCollectionEntries(params: {
  deferredUsers: DeferredCashCollectionRow[];
  pendingCashOrders: PendingCashOrderRow[];
  pendingSubscriptionPayments: PendingSubscriptionCashRow[];
}) {
  const map = new Map<string, CashCollectionEntry>();

  for (const user of params.deferredUsers) {
    const entry = getOrCreateEntry(map, user.id, user);
    entry.deferredAmount += user.deferred_balance ?? 0;
  }

  for (const order of params.pendingCashOrders) {
    const entry = getOrCreateEntry(map, order.user_id, order.user);
    entry.cashOrderAmount += order.total_amount ?? 0;
  }

  for (const payment of params.pendingSubscriptionPayments) {
    if ((payment.cash_due_amount ?? 0) <= 0) continue;
    const entry = getOrCreateEntry(map, payment.user_id, payment.user);
    entry.subscriptionCashAmount += payment.cash_due_amount ?? 0;
  }

  const entries = Array.from(map.values())
    .map((entry) => ({
      ...entry,
      totalAmount:
        entry.deferredAmount + entry.cashOrderAmount + entry.subscriptionCashAmount,
    }))
    .filter((entry) => entry.totalAmount > 0)
    .sort((left, right) => {
      if (right.totalAmount !== left.totalAmount) {
        return right.totalAmount - left.totalAmount;
      }
      return left.name.localeCompare(right.name, 'ja');
    });

  return entries;
}

export function describeCashCollectionBreakdown(entry: Pick<
  CashCollectionEntry,
  'deferredAmount' | 'cashOrderAmount' | 'subscriptionCashAmount'
>) {
  const parts: string[] = [];

  if (entry.deferredAmount > 0) {
    parts.push(`後払い・現金チャージ ¥${entry.deferredAmount.toLocaleString()}`);
  }
  if (entry.cashOrderAmount > 0) {
    parts.push(`現金注文 ¥${entry.cashOrderAmount.toLocaleString()}`);
  }
  if (entry.subscriptionCashAmount > 0) {
    parts.push(`サブスク現金 ¥${entry.subscriptionCashAmount.toLocaleString()}`);
  }

  return parts.join(' / ');
}
