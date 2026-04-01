'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { ArrowRight, CheckCircle2, ShoppingBag, UserCircle2 } from 'lucide-react';

const paymentLabels: Record<string, string> = {
  balance: '残高払い',
  deferred: '後払い',
  cash: '現金払い',
};

export default function OrderCompletePage() {
  const searchParams = useSearchParams();
  const payment = searchParams.get('payment') ?? '';
  const orderId = searchParams.get('order') ?? '';

  return (
    <UserLayout>
      <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
        <div className="card space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-matcha/15 text-matcha-dark">
            <CheckCircle2 size={36} />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold text-espresso">購入が完了しました</h1>
            <p className="text-sm text-espresso-500">
              {payment ? `${paymentLabels[payment] ?? payment}で注文を受け付けました。` : '注文を受け付けました。'}
            </p>
            {orderId && <p className="text-xs text-espresso-400">注文番号: {orderId}</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/cart"
            className="card flex min-h-[140px] flex-col justify-between transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
          >
            <ShoppingBag className="text-espresso" size={28} />
            <div>
              <p className="font-medium text-espresso">カートを見る</p>
              <p className="mt-1 text-sm text-espresso-400">追加済みの商品や次の注文を確認</p>
            </div>
          </Link>

          <Link
            href="/mypage"
            className="card flex min-h-[140px] flex-col justify-between transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
          >
            <UserCircle2 className="text-espresso" size={28} />
            <div>
              <p className="font-medium text-espresso">マイページを見る</p>
              <p className="mt-1 text-sm text-espresso-400">注文履歴や残高を確認</p>
            </div>
          </Link>

          <Link
            href="/"
            className="card flex min-h-[140px] flex-col justify-between bg-espresso text-cream-50 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
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
