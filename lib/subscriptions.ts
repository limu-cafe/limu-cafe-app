import type {
  SubscriptionBillingIntervalUnit,
  SubscriptionPayment,
  SubscriptionPaymentPriority,
  SubscriptionProduct,
  SubscriptionStatus,
  UserSubscription,
} from '@/types';

export const SUBSCRIPTION_PRIORITY_OPTIONS: SubscriptionPaymentPriority[] = [
  'points',
  'balance',
  'cash',
];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: '契約中',
  cancel_at_period_end: '解約予定',
  expired: '終了済み',
};

export const SUBSCRIPTION_PAYMENT_STATUS_LABELS = {
  pending_cash_settlement: '未精算',
  completed: '反映済み',
  cancelled: 'キャンセル',
} as const;

export const SUBSCRIPTION_PAYMENT_METHOD_LABELS = {
  points: 'ポイント',
  balance: '残高',
  cash: '現金',
  mixed: '複合',
} as const;

export function sanitizeSubscriptionPaymentPriority(
  value: unknown
): SubscriptionPaymentPriority[] {
  const input = Array.isArray(value) ? value : [];
  const deduped = input.filter((entry): entry is SubscriptionPaymentPriority =>
    SUBSCRIPTION_PRIORITY_OPTIONS.includes(entry as SubscriptionPaymentPriority)
  );
  const unique = Array.from(new Set(deduped));
  for (const option of SUBSCRIPTION_PRIORITY_OPTIONS) {
    if (!unique.includes(option)) {
      unique.push(option);
    }
  }
  return unique.slice(0, SUBSCRIPTION_PRIORITY_OPTIONS.length);
}

export function getAcademicYearEndMonthValue(now = new Date()) {
  const month = now.getMonth() + 1;
  const year = month <= 3 ? now.getFullYear() : now.getFullYear() + 1;
  return `${year}-03`;
}

export function parseMonthValue(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
}

export function monthValueToDate(value: string) {
  const parsed = parseMonthValue(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
}

export function monthValueToStorageDate(value: string) {
  const parsed = parseMonthValue(value);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-01`;
}

export function storageDateToMonthValue(value: string | null | undefined) {
  return normalizeMonthValue(value) ?? '';
}

export function normalizeMonthValue(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 7);
  return null;
}

export function getEndMonthDeadline(value: string) {
  const monthValue = normalizeMonthValue(value);
  if (!monthValue) return null;
  const parsed = parseMonthValue(monthValue);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month, 0, 23, 59, 59, 999));
}

function addMonthsWithMonthEndFallback(base: Date, count: number) {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const date = base.getUTCDate();
  const targetMonthDate = new Date(
    Date.UTC(year, month + count, 1, base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds(), base.getUTCMilliseconds())
  );
  const lastDay = new Date(Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonthDate.setUTCDate(Math.min(date, lastDay));
  return targetMonthDate;
}

export function addSubscriptionInterval(
  base: Date,
  intervalCount: number,
  intervalUnit: SubscriptionBillingIntervalUnit
) {
  const next = new Date(base);
  if (intervalUnit === 'day') {
    next.setUTCDate(next.getUTCDate() + intervalCount);
    return next;
  }
  if (intervalUnit === 'week') {
    next.setUTCDate(next.getUTCDate() + intervalCount * 7);
    return next;
  }
  return addMonthsWithMonthEndFallback(base, intervalCount);
}

export function getSubscriptionPeriod(
  periodStartAt: Date,
  intervalCount: number,
  intervalUnit: SubscriptionBillingIntervalUnit
) {
  const nextBillingAt = addSubscriptionInterval(periodStartAt, intervalCount, intervalUnit);
  const periodEndAt = new Date(nextBillingAt.getTime() - 1);
  return {
    currentPeriodStartAt: periodStartAt,
    currentPeriodEndAt: periodEndAt,
    nextBillingAt,
  };
}

export function resolveSubscriptionFunding(params: {
  amount: number;
  pointsBalance: number;
  cashBalance: number;
  priority: SubscriptionPaymentPriority[];
  allowPartialPayment: boolean;
  pointsEnabled: boolean;
  balanceEnabled: boolean;
}) {
  let remaining = params.amount;
  let pointsUsed = 0;
  let balanceUsed = 0;
  let cashDueAmount = 0;

  for (const method of sanitizeSubscriptionPaymentPriority(params.priority)) {
    if (remaining <= 0) break;

    if (method === 'points') {
      if (!params.pointsEnabled) continue;
      const available = Math.max(0, params.pointsBalance - pointsUsed);
      if (available <= 0) continue;
      const usable = params.allowPartialPayment
        ? Math.min(remaining, available)
        : available >= remaining
          ? remaining
          : 0;
      pointsUsed += usable;
      remaining -= usable;
      continue;
    }

    if (method === 'balance') {
      if (!params.balanceEnabled) continue;
      const available = Math.max(0, params.cashBalance - balanceUsed);
      if (available <= 0) continue;
      const usable = params.allowPartialPayment
        ? Math.min(remaining, available)
        : available >= remaining
          ? remaining
          : 0;
      balanceUsed += usable;
      remaining -= usable;
      continue;
    }

    if (method === 'cash') {
      cashDueAmount += remaining;
      remaining = 0;
    }
  }

  if (remaining > 0) {
    cashDueAmount += remaining;
    remaining = 0;
  }

  const paymentMethod =
    cashDueAmount > 0 && (pointsUsed > 0 || balanceUsed > 0)
      ? 'mixed'
      : cashDueAmount > 0
        ? 'cash'
        : pointsUsed > 0 && balanceUsed > 0
          ? 'mixed'
          : pointsUsed > 0
            ? 'points'
            : 'balance';

  return {
    pointsUsed,
    balanceUsed,
    cashDueAmount,
    paymentMethod,
    paymentStatus: cashDueAmount > 0 ? 'pending_cash_settlement' : 'completed',
  } as const;
}

export function getSubscriptionDisplayName(
  product: Pick<SubscriptionProduct, 'name' | 'english_name'>,
  locale: 'ja' | 'en'
) {
  return locale === 'en' && product.english_name ? product.english_name : product.name;
}

export function formatSubscriptionInterval(
  intervalCount: number,
  intervalUnit: SubscriptionBillingIntervalUnit,
  locale: 'ja' | 'en' = 'ja'
) {
  if (locale === 'en') {
    const unit =
      intervalUnit === 'day'
        ? intervalCount === 1
          ? 'day'
          : 'days'
        : intervalUnit === 'week'
          ? intervalCount === 1
            ? 'week'
            : 'weeks'
          : intervalCount === 1
            ? 'month'
            : 'months';
    return `Every ${intervalCount} ${unit}`;
  }

  const unit = intervalUnit === 'day' ? '日' : intervalUnit === 'week' ? '週' : 'か月';
  return `${intervalCount}${unit}ごと`;
}

export function canCancelSubscriptionPayment(
  subscriptionStatus: SubscriptionStatus | null | undefined
) {
  return subscriptionStatus === 'cancel_at_period_end' || subscriptionStatus === 'expired';
}

export function buildSubscriptionHistoryLabel(
  payment: Pick<
    SubscriptionPayment,
    'payment_method' | 'payment_status' | 'points_used' | 'balance_used' | 'cash_due_amount'
  >
) {
  return {
    paymentMethodLabel:
      SUBSCRIPTION_PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method,
    paymentStatusLabel:
      SUBSCRIPTION_PAYMENT_STATUS_LABELS[payment.payment_status] ?? payment.payment_status,
    breakdown: {
      pointsUsed: payment.points_used,
      balanceUsed: payment.balance_used,
      cashDueAmount: payment.cash_due_amount,
    },
  };
}

export function pickLatestSubscriptionsByProduct<T extends { subscription_product_id: string; created_at: string }>(
  rows: T[]
) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const current = map.get(row.subscription_product_id);
    if (!current || new Date(row.created_at).getTime() > new Date(current.created_at).getTime()) {
      map.set(row.subscription_product_id, row);
    }
  }
  return map;
}

export function isSubscriptionActiveLike(status: SubscriptionStatus) {
  return status === 'active' || status === 'cancel_at_period_end';
}
