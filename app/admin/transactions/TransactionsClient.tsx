'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';

type UserSummary = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type OrderSummary = {
  id: string;
  user_id: string;
  user?: UserSummary | null;
  total_amount: number;
  points_used?: number;
  payment_method: string;
  deferred_settlement_method?: string | null;
  payment_status: string;
  created_at: string;
  order_items?: Array<{ item_name: string; quantity: number }>;
};

type ChargeSummary = {
  id: string;
  user_id: string;
  user?: UserSummary | null;
  amount: number;
  method: string;
  status: string;
  note?: string | null;
  created_at: string;
  approved_at?: string | null;
  is_cash_settled: boolean;
};

type SettlementSummary = {
  id: string;
  user_id: string;
  user?: UserSummary | null;
  amount: number;
  method: string;
  status: string;
  period_start: string;
  period_end: string;
  created_at: string;
};

type SubscriptionPaymentSummary = {
  id: string;
  user_id: string;
  user_subscription_id: string;
  user?: UserSummary | null;
  amount: number;
  payment_method: string;
  payment_status: string;
  points_used: number;
  balance_used: number;
  cash_due_amount: number;
  billing_period_start_at: string;
  billing_period_end_at: string;
  created_at: string;
  subscription_product?: {
    id: string;
    name: string;
    english_name?: string | null;
  } | null;
  user_subscription?: {
    status: string;
  } | null;
};

type DeferredUserSummary = {
  id: string;
  name: string;
  avatar_url?: string | null;
  deferred_balance: number;
};

type HistoryFilter = 'all' | 'orders' | 'charges' | 'settlements' | 'subscriptions';

const paymentMethodLabel: Record<string, string> = {
  balance: '残高',
  deferred: '後払い',
  cash: '現金',
  stripe: 'クレカ',
};

const subscriptionPaymentMethodLabel: Record<string, string> = {
  points: 'ポイント',
  balance: '残高',
  cash: '現金',
  mixed: '複合',
};

const deferredMethodLabel: Record<string, string> = {
  cash: '現金で精算',
  stripe: 'クレカで精算',
};

const orderStatusLabel: Record<string, string> = {
  pending: '未精算',
  completed: '完了',
  cancelled: 'キャンセル',
  refunded: '返金済み',
};

const chargeStatusLabel: Record<string, string> = {
  pending: '承認待ち',
  approved: '反映済み',
  rejected: '却下',
  cancelled: '取消',
  refunded: '返金済み',
};

const subscriptionStatusLabel: Record<string, string> = {
  pending_cash_settlement: '未精算',
  completed: '反映済み',
  cancelled: 'キャンセル',
};

const settlementMethodOptions = [
  { id: 'cash', label: '現金' },
  { id: 'balance', label: '残高' },
] as const;

function formatMoney(value: number) {
  return `¥${value.toLocaleString()}`;
}

function formatDateTime(value: string) {
  return format(new Date(value), 'M/d HH:mm', { locale: ja });
}

function Avatar({ user }: { user?: UserSummary | DeferredUserSummary | null }) {
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-sm font-medium text-gray-300">
      {user?.name?.[0] ?? '?'}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20'
      : tone === 'success'
        ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
        : 'bg-white/10 text-white hover:bg-white/15';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${toneClass} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

export default function TransactionsClient({
  orders,
  charges,
  settlements,
  subscriptionPayments,
  deferredUsers,
}: {
  orders: OrderSummary[];
  charges: ChargeSummary[];
  settlements: SettlementSummary[];
  subscriptionPayments: SubscriptionPaymentSummary[];
  deferredUsers: DeferredUserSummary[];
}) {
  const router = useRouter();
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [loading, setLoading] = useState<string | null>(null);
  const [settlementMethodByUser, setSettlementMethodByUser] = useState<Record<string, string>>({});

  const pendingCashOrders = useMemo(
    () => orders.filter((order) => order.payment_method === 'cash' && order.payment_status === 'pending'),
    [orders]
  );
  const pendingChargeRequests = useMemo(
    () => charges.filter((charge) => charge.status === 'pending'),
    [charges]
  );
  const pendingCashCharges = useMemo(
    () =>
      charges.filter(
        (charge) => charge.status === 'approved' && charge.method === 'cash' && !charge.is_cash_settled
      ),
    [charges]
  );
  const pendingSubscriptionCashPayments = useMemo(
    () => subscriptionPayments.filter((payment) => payment.payment_status === 'pending_cash_settlement'),
    [subscriptionPayments]
  );

  const historyEntries = useMemo(() => {
    const normalizedOrders = orders
      .filter((order) => !(order.payment_method === 'cash' && order.payment_status === 'pending'))
      .map((order) => ({ kind: 'order' as const, created_at: order.created_at, order }));

    const normalizedCharges = charges
      .filter(
        (charge) =>
          charge.status !== 'pending' &&
          !(charge.status === 'approved' && charge.method === 'cash' && !charge.is_cash_settled)
      )
      .map((charge) => ({ kind: 'charge' as const, created_at: charge.created_at, charge }));

    const normalizedSettlements = settlements.map((settlement) => ({
      kind: 'settlement' as const,
      created_at: settlement.created_at,
      settlement,
    }));

    const normalizedSubscriptions = subscriptionPayments.map((payment) => ({
      kind: 'subscription' as const,
      created_at: payment.created_at,
      payment,
    }));

    return [...normalizedOrders, ...normalizedCharges, ...normalizedSettlements, ...normalizedSubscriptions]
      .filter((entry) => {
        if (historyFilter === 'all') return true;
        if (historyFilter === 'orders') return entry.kind === 'order';
        if (historyFilter === 'charges') return entry.kind === 'charge';
        if (historyFilter === 'settlements') return entry.kind === 'settlement';
        return entry.kind === 'subscription';
      })
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [charges, historyFilter, orders, settlements, subscriptionPayments]);

  const runAction = async ({
    key,
    request,
    success,
    confirmMessage,
  }: {
    key: string;
    request: () => Promise<Response>;
    success: string;
    confirmMessage?: string;
  }) => {
    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    setLoading(key);
    try {
      const response = await request();
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? '更新に失敗しました');
      }
      toast.success(success);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const settleDeferred = async (userId: string, amount: number) => {
    await runAction({
      key: `settle:${userId}`,
      request: () =>
        fetch('/api/admin/settlement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            amount,
            method: settlementMethodByUser[userId] ?? 'cash',
            period_start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
            period_end: format(new Date(), 'yyyy-MM-dd'),
          }),
        }),
      success: '精算しました',
      confirmMessage: 'この要回収残高を精算済みにしますか？',
    });
  };

  const requestSubscriptionPaymentCancel = async (payment: SubscriptionPaymentSummary) => {
    if (payment.user_subscription?.status === 'active') {
      toast.error('先に解約してください');
      return;
    }

    await runAction({
      key: `subscription-cancel:${payment.id}`,
      request: () => fetch(`/api/admin/subscription-payments/${payment.id}/cancel`, { method: 'POST' }),
      success: 'サブスク支払をキャンセルしました',
      confirmMessage: 'このサブスク支払をキャンセルしますか？',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-bold text-white">取引履歴</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">現金注文 {pendingCashOrders.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">現金チャージ {pendingCashCharges.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">サブスク現金 {pendingSubscriptionCashPayments.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">要回収残高 {deferredUsers.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">承認待ち {pendingChargeRequests.length}</span>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">要対応</h2>
        </div>

        {pendingCashOrders.length === 0 &&
        pendingCashCharges.length === 0 &&
        pendingChargeRequests.length === 0 &&
        pendingSubscriptionCashPayments.length === 0 &&
        deferredUsers.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-10 text-center text-sm text-gray-500">
            未対応の取引はありません
          </div>
        ) : (
          <div className="space-y-3">
            {pendingCashOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar user={order.user} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{order.user?.name ?? '不明なユーザー'}</p>
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                            現金注文
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{formatDateTime(order.created_at)}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300">
                      {(order.order_items ?? []).map((item) => `${item.item_name} × ${item.quantity}`).join(' / ') ||
                        '明細なし'}
                    </p>
                  </div>
                  <div className="space-y-3 lg:text-right">
                    <p className="font-display text-2xl font-bold text-white">{formatMoney(order.total_amount)}</p>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <ActionButton
                        tone="success"
                        disabled={loading === `order-settle:${order.id}`}
                        onClick={() =>
                          runAction({
                            key: `order-settle:${order.id}`,
                            request: () => fetch(`/api/admin/orders/${order.id}/cash-settlement`, { method: 'POST' }),
                            success: '精算済みにしました',
                            confirmMessage: '現金注文を精算済みにしますか？',
                          })
                        }
                      >
                        精算完了
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        disabled={loading === `order-refund:${order.id}`}
                        onClick={() =>
                          runAction({
                            key: `order-refund:${order.id}`,
                            request: () => fetch(`/api/admin/orders/${order.id}/refund`, { method: 'POST' }),
                            success: '返金しました',
                            confirmMessage: 'この現金注文を返金しますか？',
                          })
                        }
                      >
                        返金
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {pendingCashCharges.map((charge) => (
              <div key={charge.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar user={charge.user} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{charge.user?.name ?? '不明なユーザー'}</p>
                          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                            現金チャージ
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{formatDateTime(charge.created_at)}</p>
                      </div>
                    </div>
                    {charge.note && <p className="text-sm text-gray-400">{charge.note}</p>}
                  </div>
                  <div className="space-y-3 lg:text-right">
                    <p className="font-display text-2xl font-bold text-white">{formatMoney(charge.amount)}</p>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <ActionButton
                        tone="success"
                        disabled={loading === `charge-settle:${charge.id}`}
                        onClick={() =>
                          runAction({
                            key: `charge-settle:${charge.id}`,
                            request: () => fetch(`/api/admin/charge/${charge.id}/cash-settlement`, { method: 'POST' }),
                            success: '精算済みにしました',
                            confirmMessage: 'この現金チャージを精算済みにしますか？',
                          })
                        }
                      >
                        精算完了
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        disabled={loading === `charge-refund:${charge.id}`}
                        onClick={() =>
                          runAction({
                            key: `charge-refund:${charge.id}`,
                            request: () => fetch(`/api/admin/charge/${charge.id}/refund`, { method: 'POST' }),
                            success: '返金しました',
                            confirmMessage: 'この現金チャージを返金しますか？',
                          })
                        }
                      >
                        返金
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {pendingSubscriptionCashPayments.map((payment) => (
              <div key={payment.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar user={payment.user} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{payment.user?.name ?? '不明なユーザー'}</p>
                          <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-300">
                            サブスク現金
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{formatDateTime(payment.created_at)}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300">
                      {payment.subscription_product?.name ?? 'サブスク'} /{' '}
                      {payment.billing_period_start_at.slice(0, 10)} - {payment.billing_period_end_at.slice(0, 10)}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {payment.points_used > 0 && (
                        <span className="rounded-full bg-matcha/10 px-2.5 py-1 text-matcha-dark">
                          ポイント {payment.points_used}pt
                        </span>
                      )}
                      {payment.balance_used > 0 && (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                          残高 ¥{payment.balance_used.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 lg:text-right">
                    <p className="font-display text-2xl font-bold text-white">
                      {formatMoney(payment.cash_due_amount || payment.amount)}
                    </p>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <ActionButton
                        tone="success"
                        disabled={loading === `subscription-settle:${payment.id}`}
                        onClick={() =>
                          runAction({
                            key: `subscription-settle:${payment.id}`,
                            request: () =>
                              fetch(`/api/admin/subscription-payments/${payment.id}/cash-settlement`, {
                                method: 'POST',
                              }),
                            success: '精算済みにしました',
                            confirmMessage: 'このサブスク現金支払を精算済みにしますか？',
                          })
                        }
                      >
                        精算完了
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        disabled={loading === `subscription-cancel:${payment.id}`}
                        onClick={() => requestSubscriptionPaymentCancel(payment)}
                      >
                        支払取消
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {pendingChargeRequests.map((charge) => (
              <div key={charge.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar user={charge.user} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{charge.user?.name ?? '不明なユーザー'}</p>
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                            承認待ちチャージ
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{formatDateTime(charge.created_at)}</p>
                      </div>
                    </div>
                    {charge.note && <p className="text-sm text-gray-400">{charge.note}</p>}
                  </div>
                  <div className="space-y-3 lg:text-right">
                    <p className="font-display text-2xl font-bold text-white">{formatMoney(charge.amount)}</p>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <ActionButton
                        tone="danger"
                        disabled={loading === `charge-reject:${charge.id}`}
                        onClick={() =>
                          runAction({
                            key: `charge-reject:${charge.id}`,
                            request: () => fetch(`/api/admin/charge/${charge.id}/reject`, { method: 'POST' }),
                            success: '却下しました',
                          })
                        }
                      >
                        却下
                      </ActionButton>
                      <ActionButton
                        tone="success"
                        disabled={loading === `charge-approve:${charge.id}`}
                        onClick={() =>
                          runAction({
                            key: `charge-approve:${charge.id}`,
                            request: () => fetch(`/api/admin/charge/${charge.id}/approve`, { method: 'POST' }),
                            success: '承認しました',
                          })
                        }
                      >
                        承認
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {deferredUsers.map((user) => (
              <div key={user.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar user={user} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{user.name}</p>
                        <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                          要回収
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{formatMoney(user.deferred_balance)}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={settlementMethodByUser[user.id] ?? 'cash'}
                      onChange={(event) =>
                        setSettlementMethodByUser((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      {settlementMethodOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ActionButton
                      tone="success"
                      disabled={loading === `settle:${user.id}`}
                      onClick={() => settleDeferred(user.id, user.deferred_balance)}
                    >
                      精算完了
                    </ActionButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all' as const, label: 'すべて' },
            { id: 'orders' as const, label: '注文' },
            { id: 'charges' as const, label: 'チャージ' },
            { id: 'settlements' as const, label: '精算' },
            { id: 'subscriptions' as const, label: 'サブスク' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setHistoryFilter(option.id)}
              className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                historyFilter === option.id
                  ? 'bg-white text-gray-950'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {historyEntries.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-10 text-center text-sm text-gray-500">
            履歴はまだありません
          </div>
        ) : (
          <div className="space-y-3">
            {historyEntries.map((entry) => {
              if (entry.kind === 'order') {
                const order = entry.order;
                const paymentLabel =
                  order.payment_method === 'deferred' && order.deferred_settlement_method
                    ? `${paymentMethodLabel[order.payment_method]} / ${deferredMethodLabel[order.deferred_settlement_method] ?? order.deferred_settlement_method}`
                    : paymentMethodLabel[order.payment_method] ?? order.payment_method;

                return (
                  <div key={`order:${order.id}`} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-3">
                          <Avatar user={order.user} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">{order.user?.name ?? '不明なユーザー'}</p>
                              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">注文</span>
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-400">
                                {orderStatusLabel[order.payment_status] ?? order.payment_status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{formatDateTime(order.created_at)}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-300">
                          {(order.order_items ?? []).map((item) => `${item.item_name} × ${item.quantity}`).join(' / ') ||
                            '明細なし'}
                        </p>
                        <p className="text-xs text-gray-500">{paymentLabel}</p>
                        {(order.points_used ?? 0) > 0 && (
                          <p className="text-xs text-sky-300">利用ポイント {order.points_used}pt</p>
                        )}
                      </div>
                      <div className="space-y-3 lg:text-right">
                        <p className="font-display text-2xl font-bold text-white">{formatMoney(order.total_amount)}</p>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {order.payment_method === 'cash' && order.payment_status === 'completed' && (
                            <ActionButton
                              disabled={loading === `order-unsettle:${order.id}`}
                              onClick={() =>
                                runAction({
                                  key: `order-unsettle:${order.id}`,
                                  request: () =>
                                    fetch(`/api/admin/orders/${order.id}/cash-settlement`, {
                                      method: 'DELETE',
                                    }),
                                  success: '未精算に戻しました',
                                  confirmMessage: 'この現金注文を未精算に戻しますか？',
                                })
                              }
                            >
                              未精算に戻す
                            </ActionButton>
                          )}
                          {['pending', 'completed'].includes(order.payment_status) && (
                            <ActionButton
                              tone="danger"
                              disabled={loading === `order-refund:${order.id}`}
                              onClick={() =>
                                runAction({
                                  key: `order-refund:${order.id}`,
                                  request: () => fetch(`/api/admin/orders/${order.id}/refund`, { method: 'POST' }),
                                  success: '返金しました',
                                  confirmMessage: 'この注文を返金しますか？',
                                })
                              }
                            >
                              返金
                            </ActionButton>
                          )}
                          {['balance', 'deferred'].includes(order.payment_method) &&
                            order.payment_status === 'completed' && (
                              <ActionButton
                                tone="danger"
                                disabled={loading === `order-cancel:${order.id}`}
                                onClick={() =>
                                  runAction({
                                    key: `order-cancel:${order.id}`,
                                    request: () => fetch(`/api/admin/orders/${order.id}/cancel`, { method: 'POST' }),
                                    success: 'キャンセルしました',
                                    confirmMessage: 'この注文をキャンセルしますか？',
                                  })
                                }
                              >
                                キャンセル
                              </ActionButton>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (entry.kind === 'charge') {
                const charge = entry.charge;
                const chargeLabel =
                  charge.method === 'cash'
                    ? charge.is_cash_settled
                      ? '精算済み'
                      : charge.status === 'approved'
                        ? '未精算'
                        : chargeStatusLabel[charge.status] ?? charge.status
                    : chargeStatusLabel[charge.status] ?? charge.status;
                const methodLabel =
                  charge.method === 'cash'
                    ? '現金チャージ'
                    : charge.method === 'stripe'
                      ? 'クレカ'
                      : charge.method;

                return (
                  <div key={`charge:${charge.id}`} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-3">
                          <Avatar user={charge.user} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">{charge.user?.name ?? '不明なユーザー'}</p>
                              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">
                                チャージ
                              </span>
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-400">
                                {chargeLabel}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{formatDateTime(charge.created_at)}</p>
                          </div>
                        </div>
                        {charge.note && <p className="text-sm text-gray-400">{charge.note}</p>}
                        <p className="text-xs text-gray-500">{methodLabel}</p>
                      </div>
                      <div className="space-y-3 lg:text-right">
                        <p className="font-display text-2xl font-bold text-white">{formatMoney(charge.amount)}</p>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {charge.status === 'approved' && charge.method === 'cash' && charge.is_cash_settled && (
                            <ActionButton
                              disabled={loading === `charge-unsettle:${charge.id}`}
                              onClick={() =>
                                runAction({
                                  key: `charge-unsettle:${charge.id}`,
                                  request: () =>
                                    fetch(`/api/admin/charge/${charge.id}/cash-settlement`, {
                                      method: 'DELETE',
                                    }),
                                  success: '未精算に戻しました',
                                  confirmMessage: 'この現金チャージを未精算に戻しますか？',
                                })
                              }
                            >
                              未精算に戻す
                            </ActionButton>
                          )}
                          {charge.status === 'approved' && (
                            <ActionButton
                              tone="danger"
                              disabled={loading === `charge-refund:${charge.id}`}
                              onClick={() =>
                                runAction({
                                  key: `charge-refund:${charge.id}`,
                                  request: () => fetch(`/api/admin/charge/${charge.id}/refund`, { method: 'POST' }),
                                  success: '返金しました',
                                  confirmMessage: 'このチャージを返金しますか？',
                                })
                              }
                            >
                              返金
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (entry.kind === 'settlement') {
                const settlement = entry.settlement;
                return (
                  <div
                    key={`settlement:${settlement.id}`}
                    className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-3">
                          <Avatar user={settlement.user} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">{settlement.user?.name ?? '不明なユーザー'}</p>
                              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">
                                精算
                              </span>
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-400">
                                {settlement.status === 'completed' ? '精算済み' : '未精算'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{formatDateTime(settlement.created_at)}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-300">
                          {format(new Date(settlement.period_start), 'M/d', { locale: ja })} -{' '}
                          {format(new Date(settlement.period_end), 'M/d', { locale: ja })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {settlement.method === 'cash' ? '現金' : settlement.method === 'balance' ? '残高' : 'クレカ'}
                        </p>
                      </div>
                      <div className="space-y-3 lg:text-right">
                        <p className="font-display text-2xl font-bold text-white">{formatMoney(settlement.amount)}</p>
                        {settlement.status === 'completed' && (
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <ActionButton
                              disabled={loading === `settlement-revert:${settlement.id}`}
                              onClick={() =>
                                runAction({
                                  key: `settlement-revert:${settlement.id}`,
                                  request: () =>
                                    fetch(`/api/admin/settlements/${settlement.id}/revert`, {
                                      method: 'POST',
                                    }),
                                  success: '未精算に戻しました',
                                  confirmMessage: 'この精算を未精算に戻しますか？',
                                })
                              }
                            >
                              未精算に戻す
                            </ActionButton>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              const payment = entry.payment;
              const canCancel = payment.payment_status !== 'cancelled';

              return (
                <div key={`subscription:${payment.id}`} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center gap-3">
                        <Avatar user={payment.user} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-white">{payment.user?.name ?? '不明なユーザー'}</p>
                            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">
                              サブスク
                            </span>
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-400">
                              {subscriptionStatusLabel[payment.payment_status]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">{formatDateTime(payment.created_at)}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-300">
                        {payment.subscription_product?.name ?? 'サブスク'} / {payment.billing_period_start_at.slice(0, 10)} -{' '}
                        {payment.billing_period_end_at.slice(0, 10)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {subscriptionPaymentMethodLabel[payment.payment_method] ?? payment.payment_method}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {payment.points_used > 0 && (
                          <span className="rounded-full bg-matcha/10 px-2.5 py-1 text-matcha-dark">
                            ポイント {payment.points_used}pt
                          </span>
                        )}
                        {payment.balance_used > 0 && (
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                            残高 ¥{payment.balance_used.toLocaleString()}
                          </span>
                        )}
                        {payment.cash_due_amount > 0 && (
                          <span className="rounded-full bg-amber-cafe/10 px-2.5 py-1 text-amber-cafe">
                            現金 ¥{payment.cash_due_amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3 lg:text-right">
                      <p className="font-display text-2xl font-bold text-white">{formatMoney(payment.amount)}</p>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {payment.cash_due_amount > 0 && payment.payment_status === 'completed' && (
                          <ActionButton
                            disabled={loading === `subscription-unsettle:${payment.id}`}
                            onClick={() =>
                              runAction({
                                key: `subscription-unsettle:${payment.id}`,
                                request: () =>
                                  fetch(`/api/admin/subscription-payments/${payment.id}/cash-settlement`, {
                                    method: 'DELETE',
                                  }),
                                success: '未精算に戻しました',
                                confirmMessage: 'このサブスク支払を未精算に戻しますか？',
                              })
                            }
                          >
                            未精算に戻す
                          </ActionButton>
                        )}
                        {payment.cash_due_amount > 0 && payment.payment_status === 'pending_cash_settlement' && (
                          <ActionButton
                            tone="success"
                            disabled={loading === `subscription-settle:${payment.id}`}
                            onClick={() =>
                              runAction({
                                key: `subscription-settle:${payment.id}`,
                                request: () =>
                                  fetch(`/api/admin/subscription-payments/${payment.id}/cash-settlement`, {
                                    method: 'POST',
                                  }),
                                success: '精算済みにしました',
                                confirmMessage: 'このサブスク支払を精算済みにしますか？',
                              })
                            }
                          >
                            精算完了
                          </ActionButton>
                        )}
                        {canCancel && (
                          <ActionButton
                            tone="danger"
                            disabled={loading === `subscription-cancel:${payment.id}`}
                            onClick={() => requestSubscriptionPaymentCancel(payment)}
                          >
                            支払取消
                          </ActionButton>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
