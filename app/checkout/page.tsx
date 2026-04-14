'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Wallet,
  Clock,
  Banknote,
  CreditCard,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import UserLayout from '@/components/layout/UserLayout';
import { useCartStore } from '@/lib/store/cart';
import { createClient } from '@/lib/supabase/client';
import type { DeferredSettlementMethod, User } from '@/types';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import { getItemDisplayName } from '@/lib/item-display';

type PaymentTiming = 'balance' | 'deferred';

export default function CheckoutPage() {
  const { items, total, hasHydrated, clearCart } = useCartStore();
  const router = useRouter();
  const { locale } = useUserLocale();
  const [user, setUser] = useState<User | null>(null);
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>('balance');
  const [deferredSettlementMethod, setDeferredSettlementMethod] =
    useState<DeferredSettlementMethod>('cash');
  const [loading, setLoading] = useState(false);

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
          subtitle: 'Choose when to pay, then review how the order will be settled.',
          orderTotal: 'Order total',
          orderItems: 'Items',
          soldOut: 'Sold out',
          lowStock: 'Stock is getting low',
          total: 'Total',
          paymentTiming: 'When to pay',
          balance: 'Use prepaid balance',
          balanceDescription: `Current balance: ¥${user?.balance?.toLocaleString() ?? 0}`,
          balanceShortage: 'Your balance is not enough',
          deferred: 'Pay later',
          deferredDescription: 'Add this order to your deferred balance',
          settlementMethod: 'How you plan to settle it',
          cash: 'Cash',
          cashDescription: 'Settle later in cash',
          card: 'Card',
          cardDescription: 'Settle later by card',
          topUpBalance: 'Top up your balance',
          balanceSummary: 'This order will be deducted from your prepaid balance immediately.',
          deferredSummary: 'This order will be added to your deferred balance and settled later.',
          plannedSettlement: 'Planned settlement',
          confirmHeading: 'Confirmation',
          confirmButton: 'Confirm and place order',
        }
      : {
          loadingCart: '注文内容を読み込んでいます...',
          emptyCart: 'カートが空です',
          backToProducts: '商品一覧へ',
          orderFailed: '注文に失敗しました',
          orderDone: '注文が完了しました',
          heroKicker: 'Checkout',
          title: '購入確認',
          subtitle: '前払い残高を使うか、後払いにするかを選んだ上で、そのまま注文内容を確認できます。',
          orderTotal: 'Order total',
          orderItems: '注文内容',
          soldOut: '在庫切れです',
          lowStock: '在庫が少なくなっています',
          total: '合計',
          paymentTiming: '支払いタイミング',
          balance: '前払い残高を使う',
          balanceDescription: `現在の残高: ¥${user?.balance?.toLocaleString() ?? 0}`,
          balanceShortage: '残高が不足しています',
          deferred: '後払い',
          deferredDescription: '今回の注文を後払い残高に追加します',
          settlementMethod: 'あとでどう支払うか',
          cash: '現金',
          cashDescription: 'あとで現金で精算',
          card: 'クレカ',
          cardDescription: 'あとでクレカで精算',
          topUpBalance: '残高をチャージする',
          balanceSummary: '今回の注文は前払い残高からすぐに差し引かれます。',
          deferredSummary: '今回の注文は後払い残高に追加され、あとで精算します。',
          plannedSettlement: '精算予定',
          confirmHeading: '決済内容の確認',
          confirmButton: '内容を確認して注文する',
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

  const orderTotal = total();
  const hasEnoughBalance = user ? user.balance >= orderTotal : false;

  const paymentOptions = [
    {
      id: 'balance' as const,
      label: copy.balance,
      description: copy.balanceDescription,
      icon: Wallet,
      disabled: !hasEnoughBalance,
      disabledReason: copy.balanceShortage,
    },
    {
      id: 'deferred' as const,
      label: copy.deferred,
      description: copy.deferredDescription,
      icon: Clock,
      disabled: false,
    },
  ];

  const deferredOptions = [
    {
      id: 'cash' as const,
      label: copy.cash,
      description: copy.cashDescription,
      icon: Banknote,
    },
    {
      id: 'stripe' as const,
      label: copy.card,
      description: copy.cardDescription,
      icon: CreditCard,
    },
  ];

  const handleOrder = async () => {
    if (!user) return;
    setLoading(true);

    const paymentMethod = paymentTiming === 'balance' ? 'balance' : 'deferred';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ item, quantity }) => ({
            item_id: item.id,
            item_name: item.name,
            item_price: item.price,
            quantity,
            subtotal: item.price * quantity,
          })),
          total_amount: orderTotal,
          payment_method: paymentMethod,
          deferred_settlement_method:
            paymentMethod === 'deferred' ? deferredSettlementMethod : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? copy.orderFailed);
      }

      const payload = await res.json();

      clearCart();
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
              {(() => {
                const displayName = getItemDisplayName(item, locale);
                return (
                  <>
                    <div>
                      <span className="text-espresso-600">
                        {displayName}
                        <span className="ml-1 text-espresso-400">× {quantity}</span>
                      </span>
                      {item.stock <= item.stock_alert_threshold && (
                        <p className={`mt-1 text-xs ${item.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          {item.stock === 0 ? copy.soldOut : copy.lowStock}
                        </p>
                      )}
                    </div>
                    <span className="font-mono font-medium">¥{(item.price * quantity).toLocaleString()}</span>
                  </>
                );
              })()}
            </div>
          ))}
          <div className="flex justify-between border-t border-cream-200 pt-3 font-bold">
            <span>{copy.total}</span>
            <span className="font-display text-xl">¥{orderTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-medium text-espresso">{copy.paymentTiming}</h2>
          {paymentOptions.map(({ id, label, description, icon: Icon, disabled, disabledReason }) => (
            <button
              key={id}
              onClick={() => !disabled && setPaymentTiming(id)}
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
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
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

          {!hasEnoughBalance && (
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

        {paymentTiming === 'deferred' && (
          <div className="space-y-3">
            <h2 className="font-medium text-espresso">{copy.settlementMethod}</h2>
            {deferredOptions.map(({ id, label, description, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setDeferredSettlementMethod(id)}
                className={`card flex w-full items-center gap-4 text-left transition-all duration-200 ${
                  deferredSettlementMethod === id
                    ? 'bg-espresso text-cream-50 ring-2 ring-espresso'
                    : 'hover:border-espresso-400'
                }`}
              >
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                    deferredSettlementMethod === id ? 'bg-white/20' : 'bg-cream-100'
                  }`}
                >
                  <Icon
                    size={20}
                    className={deferredSettlementMethod === id ? 'text-cream-50' : 'text-espresso-600'}
                  />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{label}</p>
                  <p className={`text-sm ${deferredSettlementMethod === id ? 'text-cream-200' : 'text-espresso-400'}`}>
                    {description}
                  </p>
                </div>
                {deferredSettlementMethod === id && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white">
                    <div className="h-2.5 w-2.5 rounded-full bg-espresso" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="card space-y-3 border-espresso-200/70 bg-white/80">
          <div className="flex items-center gap-2 text-sm font-medium text-espresso">
            <CheckCircle2 size={18} />
            <span>{copy.confirmHeading}</span>
          </div>
          <p className="text-sm text-espresso-500">
            {paymentTiming === 'balance' ? copy.balanceSummary : copy.deferredSummary}
          </p>
          {paymentTiming === 'deferred' && (
            <p className="text-sm text-espresso-500">
              {copy.plannedSettlement}: {deferredSettlementMethod === 'cash' ? copy.cash : copy.card}
            </p>
          )}
        </div>

        <button
          onClick={handleOrder}
          disabled={loading}
          className="btn-matcha flex w-full items-center justify-center gap-2 py-4 text-base"
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
    </UserLayout>
  );
}
