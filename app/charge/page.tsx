'use client';

import { useCallback, useEffect, useState } from 'react';
import UserLayout from '@/components/layout/UserLayout';
import toast from 'react-hot-toast';
import { Banknote, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import { playSuccessSound } from '@/lib/ui-sounds';
import type { DeferredAllowance } from '@/lib/deferred-limit';

const PRESET_AMOUNTS = [500, 1000, 2000, 3000, 5000];
// Top-ups are collected in cash at settlement time.
const method = 'cash' as const;
const yen = (value: number) => `¥${value.toLocaleString()}`;

export default function ChargePage() {
  const router = useRouter();
  const { locale } = useUserLocale();
  const [amount, setAmount] = useState<number | ''>('');
  const [allowance, setAllowance] = useState<DeferredAllowance | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const copy =
    locale === 'en'
      ? {
          minAmount: 'Please enter at least ¥100',
          successCash: 'Top-up reflected. The amount was added to your deferred balance.',
          rewardPoints: (points: number) => `${points}pt added as a charge reward.`,
          title: 'Top up balance',
          subtitle:
            'Your balance becomes available right away. Cash top-ups are settled later.',
          amount: 'Top-up amount',
          amountPlaceholder: 'Enter amount',
          paymentMethod: 'Payment method',
          cash: 'Cash',
          cashDescription: 'Available immediately and collected at settlement time',
          allowance: (remaining: number, limit: number) =>
            `You can top up ${yen(remaining)} more (pay-later limit ${yen(limit)})`,
          allowanceNote: 'The limit covers unsettled top-ups and pay-later orders together.',
          overAllowance: (remaining: number) =>
            `This exceeds the limit. You can top up ${yen(remaining)} more.`,
          noAllowance: 'You have reached the pay-later limit. Settle your deferred balance before topping up.',
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
          rewardPoints: (points: number) => `チャージ特典として ${points}pt を付与しました。`,
          title: '残高チャージ',
          subtitle:
            'チャージした残高はすぐ使えます。代金は後払い残高に加算され、定期精算でお支払いします',
          amount: 'チャージ金額',
          amountPlaceholder: '金額を入力',
          paymentMethod: '支払い方法',
          cash: '現金',
          cashDescription: '残高へすぐ反映し、代金は定期精算で回収します',
          allowance: (remaining: number, limit: number) =>
            `あと ${yen(remaining)} までチャージできます（後払いの上限 ${yen(limit)}）`,
          allowanceNote: 'チャージと後払いの注文の、未精算分を合わせた上限です。',
          overAllowance: (remaining: number) =>
            `上限を超えます。チャージできるのはあと ${yen(remaining)} までです`,
          noAllowance: '後払いの上限に達しているため、精算するまでチャージできません',
          confirmHeading: '確認内容',
          reviewButton: '確認画面へ進む',
          reviewTitle: '最終確認',
          reviewSubtitle: 'チャージ金額と精算方法をもう一度確認してから、確定してください。',
          balanceReflection: 'チャージ残高にはすぐ反映されます。',
          settlementNote: '同時に後払い残高にも追加され、定期精算で回収されます。',
          backToCharge: '戻って修正する',
          action: 'チャージする',
        };

  // Display only. If this fails nothing is shown and the server decides.
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

  const overAllowance = allowance !== null && typeof amount === 'number' && amount > allowance.remaining;

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
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      void playSuccessSound();
      toast.success(copy.successCash);
      if (payload.reward_points > 0) {
        toast.success(copy.rewardPoints(payload.reward_points));
      }
      router.push('/mypage');
    } catch (e: any) {
      toast.error(e.message);
      void loadAllowance();
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
                disabled={allowance !== null && a > allowance.remaining}
                className={`py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
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

          {allowance && (
            <div className="rounded-2xl border border-cream-200 bg-cream-50/70 px-4 py-3 text-sm text-espresso-500">
              <p className="font-medium text-espresso">
                {allowance.remaining > 0
                  ? copy.allowance(allowance.remaining, allowance.limit)
                  : copy.noAllowance}
              </p>
              <p className="mt-1 text-xs text-espresso-400">{copy.allowanceNote}</p>
              {overAllowance && allowance.remaining > 0 && (
                <p className="mt-2 text-red-600">{copy.overAllowance(allowance.remaining)}</p>
              )}
            </div>
          )}
        </div>

        {/* 支払い方法 */}
        <div className="card space-y-3">
          <h2 className="font-medium text-espresso">{copy.paymentMethod}</h2>

          <div className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-espresso bg-espresso text-cream-50">
            <Banknote size={22} className="text-cream-50" />
            <div className="text-left flex-1">
              <p className="font-medium">{copy.cash}</p>
              <p className="text-sm text-cream-200">{copy.cashDescription}</p>
            </div>
          </div>
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
          disabled={!amount || loading || overAllowance}
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
