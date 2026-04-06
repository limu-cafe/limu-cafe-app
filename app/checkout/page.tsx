'use client';

import { useState, useEffect } from 'react';
import UserLayout from '@/components/layout/UserLayout';
import { useCartStore } from '@/lib/store/cart';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import type { User } from '@/types';
import { Wallet, Clock, Banknote, CreditCard, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type PaymentMethod = 'balance' | 'deferred' | 'cash';

export default function CheckoutPage() {
  const { items, total, clearCart, hasHydrated } = useCartStore();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('balance');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('users').select('*').eq('id', data.user.id).single();
      setUser(profile);
    });
  }, [router]);

  if (!hasHydrated) {
    return (
      <UserLayout>
        <div className="text-center py-24">
          <p className="text-espresso-400">注文内容を読み込んでいます...</p>
        </div>
      </UserLayout>
    );
  }

  if (items.length === 0) {
    return (
      <UserLayout>
        <div className="text-center py-24">
          <p className="text-espresso-400">カートが空です</p>
          <Link href="/" className="btn-primary mt-4 inline-block">商品一覧へ</Link>
        </div>
      </UserLayout>
    );
  }

  const orderTotal = total();
  const hasEnoughBalance = user ? user.balance >= orderTotal : false;

  const paymentOptions = [
    {
      id: 'balance' as const,
      label: '残高払い',
      description: `現在の残高: ¥${user?.balance.toLocaleString() ?? 0}`,
      icon: Wallet,
      disabled: !hasEnoughBalance,
      disabledReason: '残高が不足しています',
    },
    {
      id: 'deferred' as const,
      label: '後払い',
      description: '月次精算でまとめて支払い',
      icon: Clock,
      disabled: false,
    },
    {
      id: 'cash' as const,
      label: '現金払い',
      description: '管理者に確認してもらいます',
      icon: Banknote,
      disabled: false,
    },
  ];

  const handleOrder = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const supabase = createClient();
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
          payment_method: method,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? '注文に失敗しました');
      }

      const payload = await res.json();

      clearCart();
      toast.success('注文が完了しました');
      router.push(`/order-complete?payment=${method}&order=${payload.order_id ?? ''}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <UserLayout>
      <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
        <section className="hero-card px-5 py-6 sm:px-7">
          <div className="space-y-4">
            <div className="section-kicker">Checkout</div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="font-display text-4xl font-bold text-espresso">購入確認</h1>
                <p className="mt-1 text-sm text-espresso-500">
                  合計と支払い方法を確認して、そのまま注文を確定します。
                </p>
              </div>
              <div className="soft-panel bg-white/75">
                <p className="text-[11px] uppercase tracking-[0.2em] text-espresso-400">Order total</p>
                <p className="mt-2 font-display text-3xl font-bold text-espresso">¥{orderTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 注文内容 */}
        <div className="card space-y-3">
          <h2 className="font-medium text-espresso">注文内容</h2>
          {items.map(({ item, quantity }) => (
            <div key={item.id} className="flex justify-between gap-4 text-sm">
              <div>
                <span className="text-espresso-600">
                  {item.name}
                  <span className="text-espresso-400 ml-1">× {quantity}</span>
                </span>
                {item.stock <= item.stock_alert_threshold && (
                  <p className={`mt-1 text-xs ${item.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {item.stock === 0 ? '在庫切れです' : `残り${item.stock}個`}
                  </p>
                )}
              </div>
              <span className="font-mono font-medium">
                ¥{(item.price * quantity).toLocaleString()}
              </span>
            </div>
          ))}
          <div className="border-t border-cream-200 pt-3 flex justify-between font-bold">
            <span>合計</span>
            <span className="font-display text-xl">¥{orderTotal.toLocaleString()}</span>
          </div>
        </div>

        {/* 支払い方法選択 */}
        <div className="space-y-3">
          <h2 className="font-medium text-espresso">支払い方法</h2>
          {paymentOptions.map(({ id, label, description, icon: Icon, disabled, disabledReason }) => (
            <button
              key={id}
              onClick={() => !disabled && setMethod(id)}
              disabled={disabled}
              className={`w-full card text-left flex items-center gap-4 transition-all duration-200 ${
                method === id && !disabled
                  ? 'ring-2 ring-espresso bg-espresso text-cream-50'
                  : disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:border-espresso-400'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                method === id && !disabled ? 'bg-white/20' : 'bg-cream-100'
              }`}>
                <Icon size={20} className={method === id && !disabled ? 'text-cream-50' : 'text-espresso-600'} />
              </div>
              <div className="flex-1">
                <p className="font-medium">{label}</p>
                <p className={`text-sm ${method === id && !disabled ? 'text-cream-200' : 'text-espresso-400'}`}>
                  {disabled ? disabledReason : description}
                </p>
              </div>
              {method === id && !disabled && (
                <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-espresso" />
                </div>
              )}
            </button>
          ))}

          {/* チャージへのリンク（残高不足時） */}
          {!hasEnoughBalance && (
            <Link
              href="/charge"
              className="flex items-center justify-between text-sm text-matcha hover:text-matcha-dark p-3 bg-matcha/5 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2">
                <CreditCard size={16} />
                残高をチャージする
              </span>
              <ChevronRight size={16} />
            </Link>
          )}
        </div>

        {/* 注文ボタン */}
        <button
          onClick={handleOrder}
          disabled={loading}
          className="w-full btn-matcha py-4 text-base flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              注文を確定する
              <ChevronRight size={18} />
            </>
          )}
        </button>
      </div>
    </UserLayout>
  );
}
