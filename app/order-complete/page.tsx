'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, ShoppingBag, UserCircle2 } from 'lucide-react';
import UserLayout from '@/components/layout/UserLayout';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

function OrderCompleteContent() {
  const searchParams = useSearchParams();
  const { locale } = useUserLocale();
  const payment = searchParams.get('payment') ?? '';
  const orderId = searchParams.get('order') ?? '';

  const paymentLabels =
    locale === 'en'
      ? {
          balance: 'Balance',
          deferred: 'Pay later',
          cash: 'Cash',
        }
      : {
          balance: '残高払い',
          deferred: '後払い',
          cash: '現金払い',
        };

  const copy =
    locale === 'en'
      ? {
          title: 'Your order is complete',
          acceptedWith: `${paymentLabels[payment as keyof typeof paymentLabels] ?? payment} order received.`,
          accepted: 'Your order has been received.',
          orderNumber: 'Order ID',
          status: 'Status',
          paymentMethod: 'Payment method',
          nextAction: 'Next step',
          received: 'Accepted',
          unset: 'Not set',
          continueShopping: 'You can keep shopping',
          viewCart: 'View cart',
          viewCartDesc: 'Check saved items and prepare your next order',
          viewMyPage: 'Open My Page',
          viewMyPageDesc: 'See your history and balances',
          addMore: 'Add another item',
          addMoreDesc: 'Go back to products and continue shopping',
        }
      : {
          title: '購入が完了しました',
          acceptedWith: `${paymentLabels[payment as keyof typeof paymentLabels] ?? payment}で注文を受け付けました。`,
          accepted: '注文を受け付けました。',
          orderNumber: '注文番号',
          status: '状態',
          paymentMethod: '支払い方法',
          nextAction: '次の操作',
          received: '受付済み',
          unset: '未設定',
          continueShopping: '続けて購入できます',
          viewCart: 'カートを見る',
          viewCartDesc: '追加済みの商品や次の注文を確認',
          viewMyPage: 'マイページを見る',
          viewMyPageDesc: '注文履歴や残高を確認',
          addMore: 'もう1つ追加する',
          addMoreDesc: '商品一覧に戻って続けて購入',
        };

  return (
    <UserLayout>
      <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
        <div className="hero-card px-6 py-8 text-center">
          <div className="relative z-10 space-y-4">
            <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-matcha/15 text-matcha-dark">
              <CheckCircle2 size={40} />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-4xl font-bold text-espresso">{copy.title}</h1>
              <p className="text-sm text-espresso-500">
                {payment ? copy.acceptedWith : copy.accepted}
              </p>
              {orderId && <p className="text-xs text-espresso-400">{copy.orderNumber}: {orderId}</p>}
            </div>
            <div className="mx-auto grid max-w-xl gap-3 sm:grid-cols-3">
              <div className="soft-panel">
                <p className="text-[11px] tracking-[0.14em] text-espresso-400">{copy.status}</p>
                <p className="mt-2 font-semibold text-espresso">{copy.received}</p>
              </div>
              <div className="soft-panel">
                <p className="text-[11px] tracking-[0.14em] text-espresso-400">{copy.paymentMethod}</p>
                <p className="mt-2 font-semibold text-espresso">
                  {paymentLabels[payment as keyof typeof paymentLabels] ?? copy.unset}
                </p>
              </div>
              <div className="soft-panel">
                <p className="text-[11px] tracking-[0.14em] text-espresso-400">{copy.nextAction}</p>
                <p className="mt-2 font-semibold text-espresso">{copy.continueShopping}</p>
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
              <p className="font-medium text-espresso">{copy.viewCart}</p>
              <p className="mt-1 text-sm text-espresso-400">{copy.viewCartDesc}</p>
            </div>
          </Link>

          <Link
            href="/mypage"
            className="card flex min-h-[160px] flex-col justify-between transition-transform duration-200 hover:-translate-y-1.5 hover:shadow-lg"
          >
            <UserCircle2 className="text-espresso" size={28} />
            <div>
              <p className="font-medium text-espresso">{copy.viewMyPage}</p>
              <p className="mt-1 text-sm text-espresso-400">{copy.viewMyPageDesc}</p>
            </div>
          </Link>

          <Link
            href="/"
            className="flex min-h-[160px] flex-col justify-between rounded-[28px] bg-espresso p-6 text-cream-50 transition-transform duration-200 hover:-translate-y-1.5 hover:shadow-lg"
          >
            <ArrowRight className="text-cream-50" size={28} />
            <div>
              <p className="font-medium">{copy.addMore}</p>
              <p className="mt-1 text-sm text-cream-200">{copy.addMoreDesc}</p>
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
