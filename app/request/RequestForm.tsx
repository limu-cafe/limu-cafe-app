'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';

export default function RequestForm() {
  const router = useRouter();
  const [form, setForm] = useState({ item_name: '', reason: '', desired_price: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.item_name.trim()) {
      toast.error('商品名を入力してください');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          desired_price: form.desired_price ? Number(form.desired_price) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('要望を送信しました！');
      setForm({ item_name: '', reason: '', desired_price: '' });
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card space-y-4">
      <h2 className="font-medium text-espresso">新しい要望を送る</h2>

      <div className="space-y-1">
        <label className="text-sm font-medium text-espresso-600">
          商品名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="例: ポカリスエット"
          value={form.item_name}
          onChange={(e) => setForm({ ...form, item_name: e.target.value })}
          className="input"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-espresso-600">希望価格（任意）</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-espresso-400">¥</span>
          <input
            type="number"
            placeholder="150"
            value={form.desired_price}
            onChange={(e) => setForm({ ...form, desired_price: e.target.value })}
            className="input pl-8 font-mono"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-espresso-600">理由・コメント（任意）</label>
        <textarea
          placeholder="なぜ欲しいか、どんな場面で使うかなど"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          rows={3}
          className="input resize-none"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full btn-primary flex items-center justify-center gap-2"
      >
        {loading ? (
          <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
        ) : (
          <>
            <Send size={16} />
            送信する
          </>
        )}
      </button>
    </div>
  );
}
