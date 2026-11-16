'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Wallet,
  Clock,
  CreditCard,
  ChevronRight,
  CheckCircle2,
  Coins,
} from 'lucide-react';
import UserLayout from '@/components/layout/UserLayout';
import { useCartStore } from '@/lib/store/cart';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@/types';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import { getItemDisplayName } from '@/lib/item-display';
import { clampPointsToUse } from '@/lib/points';
import { CheckoutSubmission, resolvePaymentTiming, type PaymentTiming } from '@/lib/checkout';
import type { DeferredAllowance } from '@/lib/deferred-limit';
import { playSuccessSound } from '@/lib/ui-sounds';
import { isItemLowStock, isItemOutOfStock } from '@/lib/item-stock';

// Deferred orders are settled in cash; the database still accepts the other category.
const deferredSettlementMethod = 'cash' as const;
const yen = (amount: number) => `¥${amount.toLocaleString()}`;

export default function CheckoutPage() {
  const { items, total, hasHydrated, clearCart } = useCartStore();
  const router = useRouter();
  const { locale } = useUserLocale();
  const [user, setUser] = useState<User | null>(null);
  // The member's own choice. null until they pick one, so that a changed amount
  // (for example a different number of points) never replaces what they selected.
  const [chosenTiming, setChosenTiming] = useState<PaymentTiming | null>(null);
  const [allowance, setAllowance] = useState<DeferredAllowance | null>(null);
  const [pointsToUse, setPointsToUse] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const submission = useRef(new CheckoutSubmission());

  const copy =
    locale === 'en'
      ? {
          loadingCart: 'Loading your order...',
          emptyCart: 'Your cart is empty',
          backToProducts: 'Back to products',
          orderFailed: 'Failed to place order',
          orderDone: 'Order completed',
          heroKicker: 'Checkout',
          title: 'Confirm order',
          subtitle: 'Use points first if you want, then choose how to settle the remaining amount.',
          orderTotal: 'Order total',
          orderItems: 'Items',
          soldOut: 'Sold out',
          lowStock: 'Stock is getting low',
          total: 'Total',
          availablePoints: 'Available points',
          usePoints: 'Use points',
          pointsPlaceholder: 'Points to use',
          useAllPoints: 'Use all',
          pointsWorth: '1pt = ¥1',
          remainingAfterPoints: 'Remaining after points',
          pointsCoverAll: 'Your points cover the full order.',
          paymentTiming: 'When to pay',
          balance: 'Use prepaid balance',
          balanceDescription: `Current balance: ¥${user?.balance?.toLocaleString() ?? 0}`,
          balanceShortage: 'Your balance is not enough',
          deferred: 'Pay later',
          deferredDescription: 'Add the remaining amount to your deferred balance',
          deferredRemaining: (remaining: number, limit: number) =>
            `You can pay later for up to ${yen(remaining)} more (limit ${yen(limit)})`,
          deferredOverLimit: (remaining: number, limit: number) =>
            `This would exceed the pay-later limit of ${yen(limit)}. You can pay later for up to ${yen(remaining)} more.`,
          limitExceeded: (remaining: number | null, limit: number | null) =>
            remaining === null || limit === null
              ? 'This order would exceed the pay-later limit.'
              : `This order would exceed the pay-later limit of ${yen(limit)}. You can pay later for up to ${yen(remaining)} more.`,
          noPaymentAvailable:
            'Your balance is not enough and this order would exceed the pay-later limit. Remove some items, use more points, or settle your deferred balance first.',
          cash: 'Cash',
          topUpBalance: 'Top up your balance',
          balanceSummary: 'The remaining amount will be deducted from your prepaid balance immediately.',
          pointsOnlySummary: 'This order will be completed using points only.',
          deferredSummary: 'The remaining amount will be added to your deferred balance and settled later.',
          plannedSettlement: 'Planned settlement',
          confirmHeading: 'Confirmation',
          reviewButton: 'Open confirmation screen',
          reviewTitle: 'Final confirmation',
          reviewSubtitle: 'Please check the payment timing and order details once more before placing the order.',
          backToCheckout: 'Go back',
          confirmButton: 'Confirm and place order',
          pointsDeduction: 'Points used',
        }
      : {
          loadingCart: '注文内容を読み込んでいます...',
          emptyCart: 'カートが空です',
          backToProducts: '商品一覧へ',
          orderFailed: '注文に失敗しました',
          orderDone: '注文が完了しました',
          heroKicker: 'Checkout',
          title: '購入確認',
          subtitle:
            'まずポイントを使うか決めてから、残額を前払い残高にするか後払いにするかを選べます。',
          orderTotal: 'Order total',
          orderItems: '注文内容',
          soldOut: '在庫切れです',
          lowStock: '在庫が少なくなっています',
          total: '合計',
          availablePoints: '利用可能ポイント',
          usePoints: '使うポイント',
          pointsPlaceholder: '使うポイント数',
          useAllPoints: '全額使う',
          pointsWorth: '1pt = 1円で利用できます',
          remainingAfterPoints: 'ポイント適用後の残額',
          pointsCoverAll: 'ポイントだけで支払えます。',
          paymentTiming: '支払いタイミング',
          balance: '前払い残高を使う',
          balanceDescription: `現在の残高: ¥${user?.balance?.toLocaleString() ?? 0}`,
          balanceShortage: '残高が不足しています',
          deferred: '後払い',
          deferredDescription: '残額を後払い残高に追加します',
          deferredRemaining: (remaining: number, limit: number) =>
            `あと ${yen(remaining)} まで後払いにできます（上限 ${yen(limit)}）`,
          deferredOverLimit: (remaining: number, limit: number) =>
            `後払いの上限（${yen(limit)}）を超えます。後払いにできるのはあと ${yen(remaining)} までです`,
          limitExceeded: (remaining: number | null, limit: number | null) =>
            remaining === null || limit === null
              ? '後払いの上限を超えるため注文できません'
              : `後払いの上限（${yen(limit)}）を超えるため注文できません。後払いにできるのはあと ${yen(remaining)} までです`,
          noPaymentAvailable:
            '残高が足りず、後払いの上限も超えるため注文できません。商品を減らすか、ポイントを使うか、後払い分を精算してください',
          cash: '現金',
          topUpBalance: '残高をチャージする',
          balanceSummary: '今回の注文の残額は前払い残高からすぐに差し引かれます。',
          pointsOnlySummary: '今回の注文はポイントだけで完了します。',
          deferredSummary: '今回の注文の残額は後払い残高に追加され、あとで精算します。',
          plannedSettlement: '精算予定',
          confirmHeading: '決済内容の確認',
          reviewButton: '確認画面へ進む',
          reviewTitle: '最終確認',
          reviewSubtitle: '支払い方法と注文内容をもう一度確認してから、注文を確定してください。',
          backToCheckout: '戻って修正する',
          confirmButton: '内容を確認して注文する',
          pointsDeduction: '利用ポイント',
        };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase.from('users').select('*').eq('id', data.user.id).single();
      setUser(profile);
    });
  }, [router]);

  // Display only. If this fails the option stays selectable and the server decides.
  const loadAllowance = useCallback(async () => {
    try {
      const res = await fetch('/api/deferred-limit');
      if (res.ok) setAllowance(await res.json());
    } catch {
      // Keep whatever was shown before.
    }
  }, []);

  useEffect(() => {
    void loadAllowance();
  }, [loadAllowance]);

  const orderTotal = total();
  const availablePoints = user?.points_balance ?? 0;
  const requestedPoints = Number(pointsToUse || 0);
  const safePointsToUse = clampPointsToUse(requestedPoints, availablePoints, orderTotal);
  const remainingAfterPoints = Math.max(0, orderTotal - safePointsToUse);
  const hasEnoughBalance = user ? user.balance >= remainingAfterPoints : false;
  const {
    timing: paymentTiming,
    deferredAvailable,
    canOrder,
  } = resolvePaymentTiming({
    chosen: chosenTiming,
    due: remainingAfterPoints,
    balance: user?.balance ?? 0,
    deferredRemaining: allowance ? allowance.remaining : null,
  });

  if (!hasHydrated) {
    return (
      <UserLayout>
        <div className="py-24 text-center">
          <p className="text-espresso-400">{copy.loadingCart}</p>
        </div>
      </UserLayout>
    );
  }

  if (items.length === 0) {
    return (
      <UserLayout>
        <div className="py-24 text-center">
          <p className="text-espresso-400">{copy.emptyCart}</p>
          <Link href="/" className="btn-primary mt-4 inline-block">
            {copy.backToProducts}
          </Link>
        </div>
      </UserLayout>
    );
  }

  const paymentOptions = [
    {
      id: 'balance' as const,
      label: copy.balance,
      description: copy.balanceDescription,
      icon: Wallet,
      disabled: !hasEnoughBalance && remainingAfterPoints > 0,
      disabledReason: copy.balanceShortage,
    },
    {
      id: 'deferred' as const,
      label: copy.deferred,
      description: allowance
        ? copy.deferredRemaining(allowance.remaining, allowance.limit)
        : copy.deferredDescription,
      icon: Clock,
      disabled: remainingAfterPoints <= 0 || !deferredAvailable,
      disabledReason:
        remainingAfterPoints <= 0 || !allowance
          ? copy.pointsCoverAll
          : copy.deferredOverLimit(allowance.remaining, allowance.limit),
    },
  ];

  const handleOrder = async () => {
    if (!user) return;
    setLoading(true);

    const paymentMethod =
      remainingAfterPoints <= 0 ? 'balance' : paymentTiming === 'balance' ? 'balance' : 'deferred';

    const order = {
      items: items.map(({ item, quantity }) => ({
        item_id: item.id,
        item_name: item.name,
        item_price: item.price,
        quantity,
        subtotal: item.price * quantity,
      })),
      total_amount: orderTotal,
      points_used: safePointsToUse,
      payment_method: paymentMethod,
      deferred_settlement_method:
        paymentMethod === 'deferred' ? deferredSettlementMethod : null,
    };

    try {
      // The same order keeps the same request ID until it succeeds, so a retry after
      // a lost response returns the first result instead of ordering twice.
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, request_id: submission.current.requestId(order) }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.code === 'deferred_limit_exceeded') {
          // Another order or top-up used the allowance in the meantime: show the new figure.
          setShowConfirmation(false);
          void loadAllowance();
          throw new Error(copy.limitExceeded(err.remaining ?? null, err.limit ?? null));
        }
        throw new Error(err.error ?? copy.orderFailed);
      }

      const payload = await res.json();

      submission.current.complete(order);
      clearCart();
      void playSuccessSound();
      toast.success(copy.orderDone);

      const completeUrl = new URL('/order-complete', window.location.origin);
      completeUrl.searchParams.set('payment', paymentMethod);
      completeUrl.searchParams.set('order', payload.order_id ?? '');
      if (paymentMethod === 'deferred') {
        completeUrl.searchParams.set('settlement', deferredSettlementMethod);
      }
      router.push(`${completeUrl.pathname}${completeUrl.search}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <UserLayout>
      <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
        <section className="hero-card px-5 py-6 sm:px-7">
          <div className="space-y-4">
            <div className="section-kicker">{copy.heroKicker}</div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="font-display text-4xl font-bold text-espresso">{copy.title}</h1>
                <p className="mt-1 text-sm text-espresso-500">{copy.subtitle}</p>
              </div>
              <div className="soft-panel bg-white/75">
                <p className="text-[11px] uppercase tracking-[0.2em] text-espresso-400">
                  {copy.orderTotal}
                </p>
                <p className="mt-2 font-display text-3xl font-bold text-espresso">
                  ¥{orderTotal.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="card space-y-3">
          <h2 className="font-medium text-espresso">{copy.orderItems}</h2>
          {items.map(({ item, quantity }) => (
            <div key={item.id} className="flex justify-between gap-4 text-sm">
              <div>
                <span className="text-espresso-600">
                  {getItemDisplayName(item, locale)}
                  <span className="ml-1 text-espresso-400">× {quantity}</span>
                </span>
                {(isItemOutOfStock(item) || isItemLowStock(item)) && (
                  <p className={`mt-1 text-xs ${isItemOutOfStock(item) ? 'text-red-600' : 'text-amber-600'}`}>
                    {isItemOutOfStock(item) ? copy.soldOut : copy.lowStock}
                  </p>
                )}
              </div>
              <span className="font-mono font-medium">¥{(item.price * quantity).toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-cream-200 pt-3 font-bold">
            <span>{copy.total}</span>
            <span className="font-display text-xl">¥{orderTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-espresso">{copy.usePoints}</h2>
              <p className="text-sm text-espresso-400">{copy.pointsWorth}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-matcha/10 px-3 py-1.5 text-sm font-medium text-matcha-dark">
              <Coins size={16} />
              {availablePoints.toLocaleString()}pt
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="number"
              min={0}
              max={Math.min(availablePoints, orderTotal)}
              value={pointsToUse}
              onChange={(event) => {
                setPointsToUse(event.target.value);
                setShowConfirmation(false);
              }}
              className="input flex-1"
              placeholder={copy.pointsPlaceholder}
            />
            <button
              type="button"
              onClick={() => {
                setPointsToUse(String(Math.min(availablePoints, orderTotal)));
                setShowConfirmation(false);
              }}
              className="rounded-2xl border border-cream-200 px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50"
            >
              {copy.useAllPoints}
            </button>
          </div>
          <div className="rounded-2xl border border-cream-200 bg-cream-50/70 px-4 py-3 text-sm text-espresso-500">
            <div className="flex items-center justify-between gap-4">
              <span>{copy.remainingAfterPoints}</span>
              <span className="font-display text-2xl font-bold text-espresso">
                ¥{remainingAfterPoints.toLocaleString()}
              </span>
            </div>
            {safePointsToUse > 0 && (
              <div className="mt-2 flex items-center justify-between gap-4 text-matcha-dark">
                <span>{copy.pointsDeduction}</span>
                <span>-{safePointsToUse.toLocaleString()}pt</span>
              </div>
            )}
            {remainingAfterPoints === 0 && <p className="mt-2 text-matcha-dark">{copy.pointsCoverAll}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-medium text-espresso">{copy.paymentTiming}</h2>
          {paymentOptions.map(({ id, label, description, icon: Icon, disabled, disabledReason }) => (
            <button
              key={id}
              onClick={() => {
                if (disabled) return;
                setChosenTiming(id);
                setShowConfirmation(false);
              }}
              disabled={disabled}
              className={`card flex w-full items-center gap-4 text-left transition-all duration-200 ${
                paymentTiming === id && !disabled
                  ? 'bg-espresso text-cream-50 ring-2 ring-espresso'
                  : disabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:border-espresso-400'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  paymentTiming === id && !disabled ? 'bg-white/20' : 'bg-cream-100'
                }`}
              >
                <Icon
                  size={20}
                  className={paymentTiming === id && !disabled ? 'text-cream-50' : 'text-espresso-600'}
                />
              </div>
              <div className="flex-1">
                <p className="font-medium">{label}</p>
                <p className={`text-sm ${paymentTiming === id && !disabled ? 'text-cream-200' : 'text-espresso-400'}`}>
                  {disabled ? disabledReason : description}
                </p>
              </div>
              {paymentTiming === id && !disabled && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white">
                  <div className="h-2.5 w-2.5 rounded-full bg-espresso" />
                </div>
              )}
            </button>
          ))}

          {!hasEnoughBalance && remainingAfterPoints > 0 && (
            <Link
              href="/charge"
              className="flex items-center justify-between rounded-lg bg-matcha/5 p-3 text-sm text-matcha transition-colors hover:text-matcha-dark"
            >
              <span className="flex items-center gap-2">
                <CreditCard size={16} />
                {copy.topUpBalance}
              </span>
              <ChevronRight size={16} />
            </Link>
          )}
        </div>

        {user && !canOrder && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {copy.noPaymentAvailable}
          </p>
        )}

        <div className="card space-y-3 border-espresso-200/70 bg-white/80">
          <div className="flex items-center gap-2 text-sm font-medium text-espresso">
            <CheckCircle2 size={18} />
            <span>{copy.confirmHeading}</span>
          </div>
          <p className="text-sm text-espresso-500">
            {remainingAfterPoints <= 0
              ? copy.pointsOnlySummary
              : paymentTiming === 'balance'
                ? copy.balanceSummary
                : copy.deferredSummary}
          </p>
          {paymentTiming === 'deferred' && remainingAfterPoints > 0 && (
            <p className="text-sm text-espresso-500">
              {copy.plannedSettlement}: {copy.cash}
            </p>
          )}
        </div>

        <button
          onClick={() => setShowConfirmation(true)}
          disabled={loading || !canOrder}
          className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-base"
        >
          {copy.reviewButton}
          <ChevronRight size={18} />
        </button>

        {showConfirmation && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-espresso/45 p-4 sm:items-center">
            <div className="w-full max-w-xl rounded-[28px] border border-cream-200 bg-white p-6 shadow-2xl">
              <div className="space-y-2">
                <div className="section-kicker">{copy.heroKicker}</div>
                <h2 className="font-display text-3xl font-bold text-espresso">{copy.reviewTitle}</h2>
                <p className="text-sm text-espresso-500">{copy.reviewSubtitle}</p>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-cream-200 bg-cream-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-espresso">
                    <CheckCircle2 size={18} />
                    <span>{copy.confirmHeading}</span>
                  </div>
                  <p className="mt-3 text-sm text-espresso-500">
                    {remainingAfterPoints <= 0
                      ? copy.pointsOnlySummary
                      : paymentTiming === 'balance'
                        ? copy.balanceSummary
                        : copy.deferredSummary}
                  </p>
                  {paymentTiming === 'deferred' && remainingAfterPoints > 0 && (
                    <p className="mt-2 text-sm text-espresso-500">
                      {copy.plannedSettlement}: {copy.cash}
                    </p>
                  )}
                  {safePointsToUse > 0 && (
                    <p className="mt-2 text-sm text-matcha-dark">
                      {copy.pointsDeduction}: {safePointsToUse.toLocaleString()}pt
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-cream-200 p-4">
                  <h3 className="font-medium text-espresso">{copy.orderItems}</h3>
                  <div className="mt-3 space-y-2">
                    {items.map(({ item, quantity }) => (
                      <div key={item.id} className="flex justify-between gap-4 text-sm">
                        <span className="text-espresso-600">
                          {getItemDisplayName(item, locale)}
                          <span className="ml-1 text-espresso-400">× {quantity}</span>
                        </span>
                        <span className="font-mono font-medium">¥{(item.price * quantity).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-cream-200 pt-3 font-bold text-espresso">
                    <span>{copy.total}</span>
                    <span className="font-display text-xl">¥{orderTotal.toLocaleString()}</span>
                  </div>
                  {safePointsToUse > 0 && (
                    <>
                      <div className="mt-2 flex justify-between text-sm text-matcha-dark">
                        <span>{copy.pointsDeduction}</span>
                        <span>-{safePointsToUse.toLocaleString()}pt</span>
                      </div>
                      <div className="mt-2 flex justify-between border-t border-cream-200 pt-3 font-bold text-espresso">
                        <span>{copy.remainingAfterPoints}</span>
                        <span className="font-display text-xl">¥{remainingAfterPoints.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={loading}
                  className="flex-1 rounded-full border border-cream-300 px-5 py-3 text-sm font-medium text-espresso transition hover:bg-cream-50"
                >
                  {copy.backToCheckout}
                </button>
                <button
                  onClick={handleOrder}
                  disabled={loading}
                  className="btn-matcha flex flex-1 items-center justify-center gap-2 py-3 text-sm"
                >
                  {loading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      {copy.confirmButton}
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
