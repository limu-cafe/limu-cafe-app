'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CalendarClock, Coins, CreditCard, Repeat2, Wallet } from 'lucide-react';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import type {
  SubscriptionPayment,
  SubscriptionPaymentPriority,
  SubscriptionProduct,
  User,
  UserSubscription,
} from '@/types';
import {
  formatSubscriptionInterval,
  getAcademicYearEndMonthValue,
  getSubscriptionDisplayName,
  resolveSubscriptionFunding,
  sanitizeSubscriptionPaymentPriority,
  storageDateToMonthValue,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/lib/subscriptions';

function normalizePriority(
  next: SubscriptionPaymentPriority[],
  enabledMethods: SubscriptionPaymentPriority[]
) {
  const sanitized = sanitizeSubscriptionPaymentPriority(next).filter((method) =>
    enabledMethods.includes(method)
  );
  const unique = Array.from(new Set(sanitized));
  for (const method of enabledMethods) {
    if (!unique.includes(method)) {
      unique.push(method);
    }
  }
  return unique;
}

export default function SubscriptionDetailClient({
  profile,
  product,
  latestSubscription,
  payments,
}: {
  profile: Pick<User, 'id' | 'name' | 'balance' | 'points_balance'> | null;
  product: SubscriptionProduct;
  latestSubscription: UserSubscription | null;
  payments: SubscriptionPayment[];
}) {
  const router = useRouter();
  const { locale } = useUserLocale();
  const [loading, setLoading] = useState<'subscribe' | 'save' | 'cancel' | null>(null);
  const [showSubscribeConfirm, setShowSubscribeConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const enabledMethods = useMemo(() => {
    const methods: SubscriptionPaymentPriority[] = [];
    if (product.points_enabled) methods.push('points');
    if (product.balance_enabled) methods.push('balance');
    methods.push('cash');
    return methods;
  }, [product.balance_enabled, product.points_enabled]);

  const [endMonth, setEndMonth] = useState(
    latestSubscription && latestSubscription.status !== 'expired'
      ? storageDateToMonthValue(latestSubscription.end_month)
      : getAcademicYearEndMonthValue()
  );
  const [allowPartialPayment, setAllowPartialPayment] = useState(
    latestSubscription?.allow_partial_payment ?? true
  );
  const [paymentPriority, setPaymentPriority] = useState<SubscriptionPaymentPriority[]>(
    normalizePriority(
      (latestSubscription?.payment_priority as SubscriptionPaymentPriority[] | undefined) ?? enabledMethods,
      enabledMethods
    )
  );

  const copy =
    locale === 'en'
      ? {
          back: 'Back to subscriptions',
          title: 'Subscription details',
          active: 'Status',
          nextBilling: 'Next billing',
          validUntil: 'Valid until',
          endMonth: 'Planned end month',
          priority: 'Payment priority',
          partial: 'Allow partial use',
          partialHint:
            'If enabled, points or balance will be used as much as possible before falling back to cash.',
          subscribe: 'Open contract confirmation',
          subscribeConfirm: 'Start subscription',
          save: 'Save settings',
          cancel: 'Open cancellation confirmation',
          cancelConfirm: 'Cancel from next billing',
          confirmTitle: 'Do you want to start this subscription?',
          confirmBody: 'The first billing will be created immediately. If points or balance are not enough, the rest will become cash settlement.',
          confirmPreview: 'Initial billing preview',
          cancelTitle: 'Do you want to cancel this subscription?',
          cancelBody: 'You can keep using the current paid period, but no new billing will be created after that.',
          points: 'Use points',
          balance: 'Use balance',
          cash: 'Cash fallback',
          payments: 'Recent subscription payments',
          noPayments: 'No subscription payments yet.',
          period: 'Billing period',
          contractSummary: 'Contract summary',
          contractStatus: latestSubscription ? SUBSCRIPTION_STATUS_LABELS[latestSubscription.status] : 'Not subscribed',
          notSubscribed: 'You are not subscribed yet.',
          pointsBalance: 'Points',
          prepaidBalance: 'Balance',
          backLabel: 'Back',
        }
      : {
          back: 'サブスク一覧へ戻る',
          title: 'サブスク詳細',
          active: '契約状態',
          nextBilling: '次回支払',
          validUntil: '有効期限',
          endMonth: '終了予定年月',
          priority: '支払い優先順',
          partial: '部分利用を許可',
          partialHint:
            'ON のときはポイントや残高を使えるだけ使い、足りない分は現金精算へ回します。',
          subscribe: '契約確認へ進む',
          subscribeConfirm: '契約を確定する',
          save: '設定を保存',
          cancel: '解約確認へ進む',
          cancelConfirm: '次回支払から解約する',
          confirmTitle: 'このサブスクを契約しますか？',
          confirmBody:
            '初回の支払はすぐに作成されます。ポイントや残高が足りない分は現金精算になります。',
          confirmPreview: '初回支払の予定',
          cancelTitle: 'このサブスクを解約しますか？',
          cancelBody:
            'いま支払済みの期間までは利用できますが、その後は新しい支払が発生しなくなります。',
          points: 'ポイント',
          balance: '残高',
          cash: '現金',
          payments: '最近のサブスク支払',
          noPayments: 'サブスク支払はまだありません。',
          period: '請求期間',
          contractSummary: '契約内容',
          contractStatus: latestSubscription ? SUBSCRIPTION_STATUS_LABELS[latestSubscription.status] : '未契約',
          notSubscribed: 'まだ契約していません。',
          pointsBalance: 'ポイント残高',
          prepaidBalance: '前払い残高',
          backLabel: '戻る',
        };

  const canStartNewContract =
    !latestSubscription ||
    latestSubscription.status === 'expired';

  const subscriptionPreview = useMemo(
    () =>
      resolveSubscriptionFunding({
        amount: product.price,
        pointsBalance: profile?.points_balance ?? 0,
        cashBalance: profile?.balance ?? 0,
        priority: paymentPriority,
        allowPartialPayment,
        pointsEnabled: product.points_enabled,
        balanceEnabled: product.balance_enabled,
      }),
    [
      allowPartialPayment,
      paymentPriority,
      product.balance_enabled,
      product.points_enabled,
      product.price,
      profile?.balance,
      profile?.points_balance,
    ]
  );

  const previewLines = [
    subscriptionPreview.pointsUsed > 0
      ? `${copy.points} ${subscriptionPreview.pointsUsed}pt`
      : null,
    subscriptionPreview.balanceUsed > 0
      ? `${copy.balance} ¥${subscriptionPreview.balanceUsed.toLocaleString()}`
      : null,
    subscriptionPreview.cashDueAmount > 0
      ? `${copy.cash} ¥${subscriptionPreview.cashDueAmount.toLocaleString()}`
      : null,
  ].filter(Boolean) as string[];

  const updatePriorityAt = (index: number, value: SubscriptionPaymentPriority) => {
    const next = [...paymentPriority];
    next[index] = value;
    setPaymentPriority(normalizePriority(next, enabledMethods));
  };

  const subscribe = async () => {
    setLoading('subscribe');
    try {
      const res = await fetch('/api/subscriptions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          end_month: endMonth,
          payment_priority: paymentPriority,
          allow_partial_payment: allowPartialPayment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '契約に失敗しました');
      const payment = data.payment as
        | {
            amount: number;
            points_used: number;
            balance_used: number;
            cash_due_amount: number;
          }
        | undefined;

      if (payment) {
        const parts = [
          payment.points_used > 0 ? `${copy.points} ${payment.points_used}pt` : null,
          payment.balance_used > 0
            ? `${copy.balance} ¥${payment.balance_used.toLocaleString()}`
            : null,
          payment.cash_due_amount > 0
            ? `${copy.cash} ¥${payment.cash_due_amount.toLocaleString()}`
            : null,
        ].filter(Boolean);

        toast.success(
          locale === 'en'
            ? `Subscription started. Initial billing: ${parts.join(' / ') || `¥${payment.amount.toLocaleString()}`}`
            : `サブスク契約を開始しました。初回支払: ${parts.join(' / ') || `¥${payment.amount.toLocaleString()}`}`
        );
      } else {
        toast.success(locale === 'en' ? 'Subscription started' : 'サブスク契約を開始しました');
      }
      router.refresh();
      setShowSubscribeConfirm(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const saveSettings = async () => {
    if (!latestSubscription) return;
    setLoading('save');
    try {
      const res = await fetch(`/api/subscriptions/${latestSubscription.id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          end_month: endMonth,
          payment_priority: paymentPriority,
          allow_partial_payment: allowPartialPayment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '設定の保存に失敗しました');
      toast.success(locale === 'en' ? 'Settings updated' : '設定を更新しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const cancelSubscription = async () => {
    if (!latestSubscription) return;
    setLoading('cancel');
    try {
      const res = await fetch(`/api/subscriptions/${latestSubscription.id}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '解約に失敗しました');
      toast.success(locale === 'en' ? 'Cancellation scheduled' : '解約を受け付けました');
      router.refresh();
      setShowCancelConfirm(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Link href="/subscriptions" className="inline-flex items-center gap-2 text-sm text-espresso-400 hover:text-espresso">
        <Repeat2 size={15} />
        {copy.back}
      </Link>

      <div className="card space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-cream-100 px-3 py-1 text-xs font-semibold text-espresso-500">
              <Repeat2 size={14} />
              {formatSubscriptionInterval(
                product.billing_interval_count,
                product.billing_interval_unit,
                locale
              )}
            </div>
            <h1 className="font-display text-3xl font-bold text-espresso">
              {getSubscriptionDisplayName(product, locale)}
            </h1>
            {product.description ? (
              <p className="max-w-2xl text-sm leading-6 text-espresso-500">{product.description}</p>
            ) : null}
          </div>
          <div className="rounded-3xl bg-espresso px-6 py-5 text-right text-cream-50">
            <p className="text-xs uppercase tracking-[0.18em] text-cream-200">{copy.title}</p>
            <p className="mt-2 font-display text-4xl font-bold">¥{product.price.toLocaleString()}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label={copy.active} value={copy.contractStatus} />
          <MetricCard label={copy.nextBilling} value={latestSubscription?.next_billing_at?.slice(0, 10) ?? '-'} />
          <MetricCard label={copy.validUntil} value={latestSubscription?.current_period_end_at?.slice(0, 10) ?? '-'} />
          <MetricCard label={copy.endMonth} value={latestSubscription ? storageDateToMonthValue(latestSubscription.end_month) : endMonth} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-espresso-500" />
            <h2 className="font-display text-xl font-bold text-espresso">{copy.contractSummary}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-espresso-500">
              <span className="block font-medium">{copy.endMonth}</span>
              <input
                type="month"
                value={endMonth}
                onChange={(event) => setEndMonth(event.target.value)}
                className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-espresso focus:outline-none"
              />
            </label>

            <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm text-espresso-500">
              <p className="font-medium text-espresso">{copy.pointsBalance}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-espresso">
                {(profile?.points_balance ?? 0).toLocaleString()}pt
              </p>
              <p className="mt-3 font-medium text-espresso">{copy.prepaidBalance}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-espresso">
                ¥{(profile?.balance ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="font-medium text-espresso">{copy.priority}</p>
              <p className="mt-1 text-xs text-espresso-400">{copy.partialHint}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <label key={index} className="space-y-2 text-sm text-espresso-500">
                  <span className="block text-xs uppercase tracking-[0.12em] text-espresso-400">
                    {index + 1}
                  </span>
                  <select
                    value={paymentPriority[index]}
                    onChange={(event) =>
                      updatePriorityAt(index, event.target.value as SubscriptionPaymentPriority)
                    }
                    className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-espresso focus:outline-none"
                  >
                    {enabledMethods.map((method) => (
                      <option key={method} value={method}>
                        {method === 'points' ? copy.points : method === 'balance' ? copy.balance : copy.cash}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-cream-200 px-4 py-3 text-sm text-espresso">
            <input
              type="checkbox"
              checked={allowPartialPayment}
              onChange={(event) => setAllowPartialPayment(event.target.checked)}
              className="h-4 w-4 rounded border-cream-300 text-espresso focus:ring-espresso"
            />
            <span>{copy.partial}</span>
          </label>

          {canStartNewContract ? (
            <button
              type="button"
              onClick={() => setShowSubscribeConfirm(true)}
              className="btn-primary w-full"
            >
              {copy.subscribe}
            </button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveSettings}
                disabled={loading === 'save'}
                className="btn-primary flex-1 disabled:opacity-60"
              >
                {loading === 'save' ? '...' : copy.save}
              </button>
              {latestSubscription?.status === 'active' && (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="flex-1 rounded-2xl border border-amber-cafe/30 bg-amber-cafe/10 px-4 py-3 text-sm font-medium text-amber-cafe transition-colors hover:bg-amber-cafe/20"
                >
                  {copy.cancel}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-espresso-500" />
            <h2 className="font-display text-xl font-bold text-espresso">{copy.payments}</h2>
          </div>

          {payments.length === 0 ? (
            <p className="text-sm text-espresso-400">{copy.noPayments}</p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-cream-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-espresso-400">{copy.period}</p>
                      <p className="text-sm font-medium text-espresso">
                        {payment.billing_period_start_at.slice(0, 10)} - {payment.billing_period_end_at.slice(0, 10)}
                      </p>
                    </div>
                    <span className="font-display text-xl font-bold text-espresso">
                      ¥{payment.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-cream-100 px-2.5 py-1 text-espresso-600">
                      {SUBSCRIPTION_PAYMENT_METHOD_LABELS[payment.payment_method]}
                    </span>
                    <span className="rounded-full bg-cream-100 px-2.5 py-1 text-espresso-600">
                      {SUBSCRIPTION_PAYMENT_STATUS_LABELS[payment.payment_status]}
                    </span>
                    {payment.points_used > 0 && (
                      <span className="rounded-full bg-matcha/10 px-2.5 py-1 text-matcha-dark">
                        {copy.points} {payment.points_used}pt
                      </span>
                    )}
                    {payment.balance_used > 0 && (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                        {copy.balance} ¥{payment.balance_used.toLocaleString()}
                      </span>
                    )}
                    {payment.cash_due_amount > 0 && (
                      <span className="rounded-full bg-amber-cafe/10 px-2.5 py-1 text-amber-cafe">
                        {copy.cash} ¥{payment.cash_due_amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showSubscribeConfirm && (
        <ConfirmDialog
          title={copy.confirmTitle}
          body={copy.confirmBody}
          previewTitle={copy.confirmPreview}
          previewBody={previewLines.join(' / ') || `¥${product.price.toLocaleString()}`}
          confirmLabel={copy.subscribeConfirm}
          closeLabel={copy.backLabel}
          loading={loading === 'subscribe'}
          onClose={() => setShowSubscribeConfirm(false)}
          onConfirm={subscribe}
        />
      )}

      {showCancelConfirm && (
        <ConfirmDialog
          title={copy.cancelTitle}
          body={copy.cancelBody}
          confirmLabel={copy.cancelConfirm}
          closeLabel={copy.backLabel}
          tone="danger"
          loading={loading === 'cancel'}
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={cancelSubscription}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-espresso-400">{label}</p>
      <p className="mt-2 font-medium text-espresso">{value}</p>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  previewTitle,
  previewBody,
  confirmLabel,
  closeLabel,
  onClose,
  onConfirm,
  loading,
  tone = 'default',
}: {
  title: string;
  body: string;
  previewTitle?: string;
  previewBody?: string;
  confirmLabel: string;
  closeLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <h3 className="font-display text-2xl font-bold text-espresso">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-espresso-500">{body}</p>
        {previewTitle && previewBody ? (
          <div className="mt-4 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
            <p className="text-sm font-medium text-espresso">{previewTitle}</p>
            <p className="mt-2 text-sm text-espresso-500">{previewBody}</p>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-cream-200 px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50"
          >
            {closeLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-2xl px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
              tone === 'danger' ? 'bg-amber-cafe hover:bg-amber-cafe/90' : 'bg-espresso hover:bg-espresso-600'
            }`}
          >
            {loading ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
