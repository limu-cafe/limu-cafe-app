'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

export default function RequestForm() {
  const router = useRouter();
  const { locale } = useUserLocale();
  const [form, setForm] = useState({ item_name: '', reason: '', desired_price: '' });
  const [loading, setLoading] = useState(false);
  const copy =
    locale === 'en'
      ? {
          required: 'Please enter a product name',
          submitSuccess: 'Request sent',
          title: 'Post a request',
          description: 'Share items you want to see in the cafe.',
          itemName: 'Product name',
          itemPlaceholder: 'e.g. Pocari Sweat',
          desiredPrice: 'Desired price (optional)',
          reason: 'Reason / note (optional)',
          reasonPlaceholder: 'Add any reason or extra context',
          submit: 'Send',
        }
      : {
          required: '商品名を入力してください',
          submitSuccess: '要望を送信しました！',
          title: '要望を投稿する',
          description: '欲しい商品や入れてほしい理由を共有できます。',
          itemName: '商品名',
          itemPlaceholder: '例: ポカリスエット',
          desiredPrice: '希望価格（任意）',
          reason: '理由・コメント（任意）',
          reasonPlaceholder: '理由や補足があれば入力してください',
          submit: '送信する',
        };

  const handleSubmit = async () => {
    if (!form.item_name.trim()) {
      toast.error(copy.required);
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
      toast.success(copy.submitSuccess);
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
      <div className="space-y-1">
        <h2 className="font-medium text-espresso">{copy.title}</h2>
        <p className="text-sm text-espresso-400">
          {copy.description}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-espresso-600">
          {copy.itemName} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder={copy.itemPlaceholder}
          value={form.item_name}
          onChange={(e) => setForm({ ...form, item_name: e.target.value })}
          className="input"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-espresso-600">{copy.desiredPrice}</label>
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
        <label className="text-sm font-medium text-espresso-600">{copy.reason}</label>
        <textarea
          placeholder={copy.reasonPlaceholder}
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
            {copy.submit}
          </>
        )}
      </button>
    </div>
  );
}
