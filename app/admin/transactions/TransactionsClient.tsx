'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import OrderRecord from '@/components/admin/OrderRecord';
import { isPendingCashOrder, isPendingDeferredOrder, type AdminOrder } from '@/lib/admin-objects';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';

type UserSummary = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type OrderSummary = AdminOrder;

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
  settled_at?: string | null;
  settlement_source?: string | null;
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

function formatMoney(value: number) {
  return `¥${value.toLocaleString()}`;
}

function formatDateTime(value: string) {
  return format(new Date(value), 'M/d HH:mm', { locale: ja });
}

function Avatar({ user }: { user?: UserSummary | null }) {
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
  selectedUserId = null, page = 1, hasNextPage = false,
  userChoices = [],
}: {
  selectedUserId?: string | null; page?: number; hasNextPage?: boolean;
  userChoices?: { id: string; name: string }[];
  orders: OrderSummary[];
  charges: ChargeSummary[];
  settlements: SettlementSummary[];
  subscriptionPayments: SubscriptionPaymentSummary[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingOnly = searchParams.get('state') === 'pending';
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [loading, setLoading] = useState<string | null>(null);
  const actionLock = useRef(false);
  const people = useMemo(() => userChoices.length ? userChoices : Array.from(new Map([...orders, ...charges, ...settlements, ...subscriptionPayments].filter((row) => row.user).map((row) => [row.user_id, row.user!])).values()).sort((a, b) => a.name.localeCompare(b.name, 'ja')), [userChoices, orders, charges, settlements, subscriptionPayments]);
  const pageHref = (next: number) => `/admin/transactions?page=${next}${selectedUserId ? `&user=${encodeURIComponent(selectedUserId)}` : ''}${pendingOnly ? '&state=pending' : ''}`;

  const pendingCashOrders = useMemo(
    () => orders.filter(isPendingCashOrder),
    [orders]
  );
  const pendingDeferredOrders = useMemo(
    () => orders.filter(isPendingDeferredOrder),
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
      .filter(
        (order) =>
          !isPendingCashOrder(order) && !isPendingDeferredOrder(order)
      )
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

    const normalizedSubscriptions = subscriptionPayments.filter((payment) => payment.payment_status !== 'pending_cash_settlement').map((payment) => ({
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
    if (actionLock.current) return;
    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    actionLock.current = true;
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
      actionLock.current = false;
      setLoading(null);
    }
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">会計 / 取引</p>
        <h1 className="font-display text-2xl font-bold text-white">{selectedUserId ? `${people.find(person => person.id === selectedUserId)?.name ?? '選択した利用者'}の取引` : '取引'}</h1>
        {selectedUserId && <Link prefetch={false} href={`/admin/users?user=${selectedUserId}&view=orders`} className="inline-block text-sm text-sky-300 underline underline-offset-4">この利用者の詳細へ戻る →</Link>}
        {pendingOnly && <div className="flex flex-wrap items-center gap-4 text-sm"><span className="text-amber-300">未精算・承認待ちのみ表示中</span><Link prefetch={false} href={`/admin/transactions${selectedUserId ? `?user=${selectedUserId}` : ''}`} className="text-sky-300 underline underline-offset-4">精算済みの履歴も見る</Link></div>}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">後払い注文 {pendingDeferredOrders.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">現金注文 {pendingCashOrders.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">現金チャージ {pendingCashCharges.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">サブスク現金 {pendingSubscriptionCashPayments.length}</span>
          <span className="rounded-full bg-gray-900 px-3 py-2 text-gray-300">承認待ち {pendingChargeRequests.length}</span>
        </div>
      </div>
      <form action="/admin/transactions" className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        {pendingOnly && <input type="hidden" name="state" value="pending"/>}
        <label htmlFor="transaction-user" className="text-sm text-gray-300">ユーザー</label>
        <select key={selectedUserId ?? 'all'} id="transaction-user" name="user" defaultValue={selectedUserId ?? ''} className="max-w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"><option value="">全員</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}{selectedUserId && !people.some((person) => person.id === selectedUserId) && <option value={selectedUserId}>選択中のユーザー</option>}</select>
        <button className="rounded-xl bg-white px-4 py-2 text-sm text-gray-950">絞り込む</button>
        {selectedUserId && <Link prefetch={false} href="/admin/transactions" className="text-sm text-gray-300 underline">全員に戻す</Link>}
        <p className="w-full text-xs text-gray-400">{selectedUserId ? '選択したユーザーの取引を表示中。' : '全員の取引を表示中。'}未処理の取引は期間に関係なく表示します。</p>
      </form>


      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">要回収</h2>
        </div>

        {pendingDeferredOrders.length === 0 &&
        pendingCashOrders.length === 0 &&
        pendingCashCharges.length === 0 &&
        pendingSubscriptionCashPayments.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-10 text-center text-sm text-gray-500">
            要回収の取引はありません
          </div>
        ) : (
          <div className="space-y-3">
            {pendingDeferredOrders.map((order) => <OrderRecord key={order.id} order={order} returnTo={pageHref(page)}/>)}
            {pendingCashOrders.map((order) => <OrderRecord key={order.id} order={order} returnTo={pageHref(page)}/>)}

            {pendingCashCharges.map((charge) => (
              <div key={charge.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar user={charge.user} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link prefetch={false} href={`/admin/users?user=${charge.user_id}`} className="font-medium text-sky-300 underline underline-offset-4">{charge.user?.name ?? '不明なユーザー'}</Link>
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
                        disabled={Boolean(loading)}
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
                        disabled={Boolean(loading)}
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
                          <Link prefetch={false} href={`/admin/users?user=${payment.user_id}`} className="font-medium text-sky-300 underline underline-offset-4">{payment.user?.name ?? '不明なユーザー'}</Link>
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
                        disabled={Boolean(loading)}
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
                        disabled={Boolean(loading)}
                        onClick={() => requestSubscriptionPaymentCancel(payment)}
                      >
                        支払取消
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            ))}

          </div>
        )}
      </section>

      {pendingChargeRequests.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">承認待ち</h2>
          </div>
          <div className="space-y-3">
            {pendingChargeRequests.map((charge) => (
              <div key={charge.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar user={charge.user} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link prefetch={false} href={`/admin/users?user=${charge.user_id}`} className="font-medium text-sky-300 underline underline-offset-4">{charge.user?.name ?? '不明なユーザー'}</Link>
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
                        disabled={Boolean(loading)}
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
                        disabled={Boolean(loading)}
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
          </div>
        </section>
      )}

      {!pendingOnly && <><section className="space-y-3">
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
                return <OrderRecord key={`order:${entry.order.id}`} order={entry.order} returnTo={pageHref(page)}/>;
              }

              if (entry.kind === 'charge') {
                const charge = entry.charge;
                const chargeLabel =
                  charge.method === 'cash'
                    ? charge.is_cash_settled
                      ? charge.settlement_source === 'deferred_settlement'
                        ? '精算済み'
                        : '個別精算済み'
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
                              <Link prefetch={false} href={`/admin/users?user=${charge.user_id}`} className="font-medium text-sky-300 underline underline-offset-4">{charge.user?.name ?? '不明なユーザー'}</Link>
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
                          {charge.status === 'approved' &&
                            charge.method === 'cash' &&
                            charge.is_cash_settled &&
                            charge.settlement_source === 'individual_cash_charge' && (
                            <ActionButton
                              disabled={Boolean(loading)}
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
                              disabled={Boolean(loading)}
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
                              <Link prefetch={false} href={`/admin/users?user=${settlement.user_id}`} className="font-medium text-sky-300 underline underline-offset-4">{settlement.user?.name ?? '不明なユーザー'}</Link>
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
                              disabled={Boolean(loading)}
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
                            <Link prefetch={false} href={`/admin/users?user=${payment.user_id}`} className="font-medium text-sky-300 underline underline-offset-4">{payment.user?.name ?? '不明なユーザー'}</Link>
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
                            disabled={Boolean(loading)}
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
                            disabled={Boolean(loading)}
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
                            disabled={Boolean(loading)}
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
      <nav aria-label="履歴のページ" className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
        {page > 1 && <Link prefetch={false} href={pageHref(page - 1)} className="rounded-lg border border-gray-700 px-3 py-2">新しい履歴へ</Link>}
        <span>履歴 {page}ページ目（種類ごとに80件）</span>
        {hasNextPage && <Link prefetch={false} href={pageHref(page + 1)} className="rounded-lg border border-gray-700 px-3 py-2">古い履歴へ</Link>}
      </nav></>}
    </div>
  );
}
