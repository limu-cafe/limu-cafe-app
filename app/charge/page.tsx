'use client';

import { useState } from 'react';
import UserLayout from '@/components/layout/UserLayout';
import toast from 'react-hot-toast';
import { Banknote, CreditCard, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

const PRESET_AMOUNTS = [500, 1000, 2000, 3000, 5000];

export default function ChargePage() {
  const router = useRouter();
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState<'cash' | 'stripe'>('cash');
  const [loading, setLoading] = useState(false);

  const handleCharge = async () => {
    if (!amount || amount < 100) {
      toast.error('100円以上で入力してください');
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
          ? '現金チャージを申請しました。管理者の承認をお待ちください。'
          : 'チャージが完了しました！'
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
          <h1 className="font-display font-bold text-3xl text-espresso">残高チャージ</h1>
          <p className="text-espresso-400 text-sm mt-1">
            チャージした残高は次の購入時にすぐ使えます
          </p>
        </div>

        {/* 金額入力 */}
        <div className="card space-y-4">
          <h2 className="font-medium text-espresso">チャージ金額</h2>

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
              placeholder="金額を入力"
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
              className="input pl-8 font-mono"
            />
          </div>
        </div>

        {/* 支払い方法 */}
        <div className="card space-y-3">
          <h2 className="font-medium text-espresso">支払い方法</h2>

          <button
            onClick={() => setMethod('cash')}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${
              method === 'cash'
                ? 'border-espresso bg-espresso text-cream-50'
                : 'border-cream-200 hover:border-espresso-400'
            }`}
          >
            <Banknote size={22} className={method === 'cash' ? 'text-cream-50' : 'text-espresso-600'} />
            <div className="text-left flex-1">
              <p className="font-medium">現金</p>
              <p className={`text-sm ${method === 'cash' ? 'text-cream-200' : 'text-espresso-400'}`}>
                管理者に渡して承認してもらいます
              </p>
            </div>
          </button>

          <button
            onClick={() => setMethod('stripe')}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${
              method === 'stripe'
                ? 'border-espresso bg-espresso text-cream-50'
                : 'border-cream-200 hover:border-espresso-400'
            }`}
          >
            <CreditCard size={22} className={method === 'stripe' ? 'text-cream-50' : 'text-espresso-600'} />
            <div className="text-left flex-1">
              <p className="font-medium">クレジットカード</p>
              <p className={`text-sm ${method === 'stripe' ? 'text-cream-200' : 'text-espresso-400'}`}>
                Stripe経由で即時チャージ
              </p>
            </div>
          </button>
        </div>

        {/* チャージボタン */}
        <button
          onClick={handleCharge}
          disabled={!amount || loading}
          className="w-full btn-matcha py-4 text-base flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              {amount ? `¥${Number(amount).toLocaleString()} をチャージ` : 'チャージする'}
              <ChevronRight size={18} />
            </>
          )}
        </button>
      </div>
    </UserLayout>
  );
}
