'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { ArrowRight, CheckCircle2, ShoppingBag, UserCircle2 } from 'lucide-react';

const paymentLabels: Record<string, string> = {
  balance: '残高払い',
  deferred: '後払い',
  cash: '現金払い',
};

function OrderCompleteContent() {
  const searchParams = useSearchParams();
  const payment = searchParams.get('payment') ?? '';
  const orderId = searchParams.get('order') ?? '';

  return (
    <UserLayout>
      <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
        <div className="hero-card px-6 py-8 text-center">
          <div className="relative z-10 space-y-4">
            <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-matcha/15 text-matcha-dark">
              <CheckCircle2 size={40} />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-4xl font-bold text-espresso">購入が完了しました</h1>
              <p className="text-sm text-espresso-500">
                {payment ? `${paymentLabels[payment] ?? payment}で注文を受け付けました。` : '注文を受け付けました。'}
              </p>
              {orderId && <p className="text-xs text-espresso-400">注文番号: {orderId}</p>}
            </div>
            <div className="mx-auto grid max-w-xl gap-3 sm:grid-cols-3">
              <div className="soft-panel">
                <p className="text-[11px] tracking-[0.14em] text-espresso-400">状態</p>
                <p className="mt-2 font-semibold text-espresso">受付済み</p>
              </div>
              <div className="soft-panel">
                <p className="text-[11px] tracking-[0.14em] text-espresso-400">支払い方法</p>
                <p className="mt-2 font-semibold text-espresso">{paymentLabels[payment] ?? '未設定'}</p>
              </div>
              <div className="soft-panel">
                <p className="text-[11px] tracking-[0.14em] text-espresso-400">次の操作</p>
                <p className="mt-2 font-semibold text-espresso">続けて購入できます</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/cart"
            className="card flex min-h-[160px] flex-col justify-between transition-transform duration-200 hover:-translate-y-1.5 hover:shadow-lg"
          >
            <ShoppingBag className="text-espresso" size={28} />
            <div>
              <p className="font-medium text-espresso">カートを見る</p>
              <p className="mt-1 text-sm text-espresso-400">追加済みの商品や次の注文を確認</p>
            </div>
          </Link>

          <Link
            href="/mypage"
            className="card flex min-h-[160px] flex-col justify-between transition-transform duration-200 hover:-translate-y-1.5 hover:shadow-lg"
          >
            <UserCircle2 className="text-espresso" size={28} />
            <div>
              <p className="font-medium text-espresso">マイページを見る</p>
              <p className="mt-1 text-sm text-espresso-400">注文履歴や残高を確認</p>
            </div>
          </Link>

          <Link
            href="/"
            className="flex min-h-[160px] flex-col justify-between rounded-[28px] bg-espresso p-6 text-cream-50 transition-transform duration-200 hover:-translate-y-1.5 hover:shadow-lg"
          >
            <ArrowRight className="text-cream-50" size={28} />
            <div>
              <p className="font-medium">もう1つ追加する</p>
              <p className="mt-1 text-sm text-cream-200">商品一覧に戻って続けて購入</p>
            </div>
          </Link>
        </div>
      </div>
    </UserLayout>
  );
}

export default function OrderCompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen texture-bg" />}>
      <OrderCompleteContent />
    </Suspense>
  );
}
