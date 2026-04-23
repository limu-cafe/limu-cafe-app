'use client';

import { useState } from 'react';
import UserLayout from '@/components/layout/UserLayout';
import toast from 'react-hot-toast';
import { Banknote, CreditCard, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

const PRESET_AMOUNTS = [500, 1000, 2000, 3000, 5000];

export default function ChargePage() {
  const router = useRouter();
  const { locale } = useUserLocale();
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState<'cash'>('cash');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const copy =
    locale === 'en'
      ? {
          minAmount: 'Please enter at least ¥100',
          successCash: 'Top-up reflected. The amount was added to your deferred balance.',
          success: 'Top-up completed!',
          title: 'Top up balance',
          subtitle:
            'Your balance becomes available right away. Cash top-ups are settled later.',
          amount: 'Top-up amount',
          amountPlaceholder: 'Enter amount',
          paymentMethod: 'Payment method',
          cash: 'Cash',
          cashDescription: 'Available immediately and collected at settlement time',
          card: 'Credit card',
          inProgress: 'In progress',
          cardDescription: 'Stripe support is being prepared. Please use cash for now.',
          confirmHeading: 'Confirmation',
          reviewButton: 'Open confirmation screen',
          reviewTitle: 'Final confirmation',
          reviewSubtitle: 'Please check the amount and settlement method one more time before topping up.',
          balanceReflection: 'Your balance will be available immediately.',
          settlementNote: 'The amount will also be added to your deferred balance and collected at settlement time.',
          backToCharge: 'Go back',
          action: 'Top up',
        }
      : {
          minAmount: '100円以上で入力してください',
          successCash: 'チャージを反映しました。金額は後払い残高に追加され、定期精算で回収されます。',
          success: 'チャージが完了しました！',
          title: '残高チャージ',
          subtitle:
            'チャージした残高はすぐ使えます。代金は後払い残高に加算され、定期精算でお支払いします',
          amount: 'チャージ金額',
          amountPlaceholder: '金額を入力',
          paymentMethod: '支払い方法',
          cash: '現金',
          cashDescription: '残高へすぐ反映し、代金は定期精算で回収します',
          card: 'クレジットカード',
          inProgress: '開発中',
          cardDescription: 'Stripe 連携は準備中です。現在は現金チャージをご利用ください。',
          confirmHeading: '確認内容',
          reviewButton: '確認画面へ進む',
          reviewTitle: '最終確認',
          reviewSubtitle: 'チャージ金額と精算方法をもう一度確認してから、確定してください。',
          balanceReflection: 'チャージ残高にはすぐ反映されます。',
          settlementNote: '同時に後払い残高にも追加され、定期精算で回収されます。',
          backToCharge: '戻って修正する',
          action: 'チャージする',
        };

  const handleCharge = async () => {
    if (!amount || amount < 100) {
      toast.error(copy.minAmount);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(
        method === 'cash'
          ? copy.successCash
          : copy.success
      );
      router.push('/mypage');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <UserLayout>
      <div className="max-w-md mx-auto animate-fade-in space-y-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-espresso">{copy.title}</h1>
          <p className="text-espresso-400 text-sm mt-1">
            {copy.subtitle}
          </p>
        </div>

        {/* 金額入力 */}
        <div className="card space-y-4">
          <h2 className="font-medium text-espresso">{copy.amount}</h2>

          {/* プリセット */}
          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(a)}
                className={`py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  amount === a
                    ? 'bg-espresso text-cream-50'
                    : 'bg-cream-100 text-espresso-600 hover:bg-cream-200'
                }`}
              >
                ¥{a.toLocaleString()}
              </button>
            ))}
          </div>

          {/* カスタム入力 */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-espresso-400 font-medium">¥</span>
            <input
              type="number"
              min={100}
              placeholder={copy.amountPlaceholder}
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
              className="input pl-8 font-mono"
            />
          </div>
        </div>

        {/* 支払い方法 */}
        <div className="card space-y-3">
          <h2 className="font-medium text-espresso">{copy.paymentMethod}</h2>

          <button
            onClick={() => {
              setMethod('cash');
              setShowConfirmation(false);
            }}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${
              method === 'cash'
                ? 'border-espresso bg-espresso text-cream-50'
                : 'border-cream-200 hover:border-espresso-400'
            }`}
          >
            <Banknote size={22} className={method === 'cash' ? 'text-cream-50' : 'text-espresso-600'} />
            <div className="text-left flex-1">
              <p className="font-medium">{copy.cash}</p>
              <p className={`text-sm ${method === 'cash' ? 'text-cream-200' : 'text-espresso-400'}`}>
                {copy.cashDescription}
              </p>
            </div>
          </button>

          <button
            disabled
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-cream-200 bg-cream-50/70 opacity-70 cursor-not-allowed"
          >
            <CreditCard size={22} className="text-espresso-600" />
            <div className="text-left flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{copy.card}</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {copy.inProgress}
                </span>
              </div>
              <p className="text-sm text-espresso-400">
                {copy.cardDescription}
              </p>
            </div>
          </button>
        </div>

        {/* チャージボタン */}
        <div className="card space-y-3 border-espresso-200/70 bg-white/80">
          <div className="flex items-center gap-2 text-sm font-medium text-espresso">
            <CheckCircle2 size={18} />
            <span>{copy.confirmHeading}</span>
          </div>
          <p className="text-sm text-espresso-500">{copy.balanceReflection}</p>
          <p className="text-sm text-espresso-500">{copy.settlementNote}</p>
        </div>

        <button
          onClick={() => setShowConfirmation(true)}
          disabled={!amount || loading}
          className="w-full btn-primary py-4 text-base flex items-center justify-center gap-2"
        >
          {copy.reviewButton}
          <ChevronRight size={18} />
        </button>

        {showConfirmation && amount && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-espresso/45 p-4 sm:items-center">
            <div className="w-full max-w-xl rounded-[28px] border border-cream-200 bg-white p-6 shadow-2xl">
              <div className="space-y-2">
                <div className="section-kicker">Charge</div>
                <h2 className="font-display text-3xl font-bold text-espresso">{copy.reviewTitle}</h2>
                <p className="text-sm text-espresso-500">{copy.reviewSubtitle}</p>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-cream-200 bg-cream-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-espresso">
                    <CheckCircle2 size={18} />
                    <span>{copy.confirmHeading}</span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-espresso-600">
                    <div className="flex items-center justify-between gap-4">
                      <span>{copy.amount}</span>
                      <span className="font-display text-2xl font-bold text-espresso">
                        ¥{Number(amount).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>{copy.paymentMethod}</span>
                      <span className="font-medium text-espresso">{copy.cash}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-cream-200 p-4 text-sm text-espresso-500">
                  <p>{copy.balanceReflection}</p>
                  <p className="mt-2">{copy.settlementNote}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={loading}
                  className="flex-1 rounded-full border border-cream-300 px-5 py-3 text-sm font-medium text-espresso transition hover:bg-cream-50"
                >
                  {copy.backToCharge}
                </button>
                <button
                  onClick={handleCharge}
                  disabled={loading}
                  className="btn-matcha flex flex-1 items-center justify-center gap-2 py-3 text-sm"
                >
                  {loading ? (
                    <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      {locale === 'en'
                        ? `Top up ¥${Number(amount).toLocaleString()}`
                        : `¥${Number(amount).toLocaleString()} をチャージ`}
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
