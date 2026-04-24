'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

type ItemOption = {
  id: string;
  name: string;
  category?: { name?: string; icon?: string } | null;
};

type PurchaseRunRow = {
  id: string;
  total_amount: number;
  payment_source: 'cashbox' | 'personal_advance';
  reimbursement_status: 'not_needed' | 'pending_reimbursement' | 'reimbursed';
  vendor: string | null;
  note: string | null;
  created_at: string;
  reimbursed_at?: string | null;
  created_by_user?: { name?: string | null } | null;
  purchase_run_items?: Array<{ item_name: string; quantity: number }> | null;
};

export default function ReimbursementsClient({
  items,
  purchaseRuns,
  miscExamples,
}: {
  items: ItemOption[];
  purchaseRuns: PurchaseRunRow[];
  miscExamples: string[];
}) {
  const router = useRouter();
  const [productItemId, setProductItemId] = useState(items[0]?.id ?? '');
  const [productQuantity, setProductQuantity] = useState('');
  const [productAmount, setProductAmount] = useState('');
  const [productVendor, setProductVendor] = useState('');
  const [productNote, setProductNote] = useState('');

  const [miscLabel, setMiscLabel] = useState('');
  const [miscAmount, setMiscAmount] = useState('');
  const [miscVendor, setMiscVendor] = useState('');
  const [miscNote, setMiscNote] = useState('');

  const [loading, setLoading] = useState<string | null>(null);

  const pendingRuns = useMemo(
    () => purchaseRuns.filter((run) => run.reimbursement_status === 'pending_reimbursement'),
    [purchaseRuns]
  );

  const submitProductAdvance = async () => {
    if (!productItemId) {
      toast.error('商品を選択してください');
      return;
    }

    setLoading('product');
    try {
      const res = await fetch('/api/admin/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'product',
          item_id: productItemId,
          quantity: Number(productQuantity),
          total_amount: Number(productAmount),
          vendor: productVendor,
          note: productNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '立替記録に失敗しました');

      toast.success('商品の立替を記録しました');
      setProductQuantity('');
      setProductAmount('');
      setProductVendor('');
      setProductNote('');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const submitMiscAdvance = async () => {
    setLoading('misc');
    try {
      const res = await fetch('/api/admin/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'misc',
          label: miscLabel,
          total_amount: Number(miscAmount),
          vendor: miscVendor,
          note: miscNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '立替記録に失敗しました');

      toast.success('雑費の立替を記録しました');
      setMiscLabel('');
      setMiscAmount('');
      setMiscVendor('');
      setMiscNote('');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const reimburse = async (purchaseRunId: string) => {
    if (!confirm('金庫から精算しますか？')) return;

    setLoading(`reimburse:${purchaseRunId}`);
    try {
      const res = await fetch(`/api/admin/purchases/${purchaseRunId}/reimburse`, {
        method: 'POST',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '精算に失敗しました');

      toast.success('精算しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">立替管理</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h2 className="text-base font-semibold text-white">商品の立替</h2>
          <select
            value={productItemId}
            onChange={(event) => setProductItemId(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          >
            <option value="">商品を選択</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {(item.category?.icon ?? '📦') + ' ' + item.name}
              </option>
            ))}
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="number"
              min={1}
              value={productQuantity}
              onChange={(event) => setProductQuantity(event.target.value)}
              placeholder="個数"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
            />
            <input
              type="number"
              min={1}
              value={productAmount}
              onChange={(event) => setProductAmount(event.target.value)}
              placeholder="立替額"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
            />
          </div>
          <input
            type="text"
            value={productVendor}
            onChange={(event) => setProductVendor(event.target.value)}
            placeholder="購入先"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <input
            type="text"
            value={productNote}
            onChange={(event) => setProductNote(event.target.value)}
            placeholder="メモ"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <button
            onClick={submitProductAdvance}
            disabled={loading === 'product'}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-950 transition hover:bg-gray-100 disabled:opacity-50"
          >
            {loading === 'product' ? '記録中...' : '商品の立替を記録'}
          </button>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h2 className="text-base font-semibold text-white">雑費の立替</h2>
          <div className="space-y-2">
            <input
              list="reimbursement-misc-examples"
              type="text"
              value={miscLabel}
              onChange={(event) => setMiscLabel(event.target.value)}
              placeholder="立て替えたもの"
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
            />
            <datalist id="reimbursement-misc-examples">
              {miscExamples.map((example) => (
                <option key={example} value={example} />
              ))}
            </datalist>
          </div>
          <input
            type="number"
            min={1}
            value={miscAmount}
            onChange={(event) => setMiscAmount(event.target.value)}
            placeholder="立替額"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <input
            type="text"
            value={miscVendor}
            onChange={(event) => setMiscVendor(event.target.value)}
            placeholder="購入先"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <input
            type="text"
            value={miscNote}
            onChange={(event) => setMiscNote(event.target.value)}
            placeholder="メモ"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <button
            onClick={submitMiscAdvance}
            disabled={loading === 'misc'}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-950 transition hover:bg-gray-100 disabled:opacity-50"
          >
            {loading === 'misc' ? '記録中...' : '雑費の立替を記録'}
          </button>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="font-medium text-white">未精算</h2>
        </div>
        {pendingRuns.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">未精算はありません</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {pendingRuns.map((run) => (
              <div key={run.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-white">
                    {(run.purchase_run_items ?? []).length > 0
                      ? run.purchase_run_items?.map((item) => `${item.item_name} × ${item.quantity}`).join(' / ')
                      : run.note?.split(' / ')[0] || '立替'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {run.vendor || '購入先未入力'}
                    {run.created_by_user?.name ? ` ・ ${run.created_by_user.name}` : ''}
                    {run.note ? ` ・ ${run.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-sky-300">
                    ¥{run.total_amount.toLocaleString()}
                  </span>
                  <button
                    onClick={() => reimburse(run.id)}
                    disabled={loading === `reimburse:${run.id}`}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-950 transition hover:bg-gray-100 disabled:opacity-50"
                  >
                    {loading === `reimburse:${run.id}` ? '精算中...' : '金庫から精算'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="font-medium text-white">履歴</h2>
        </div>
        {purchaseRuns.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">履歴がありません</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {purchaseRuns.map((run) => {
              const label =
                (run.purchase_run_items ?? []).length > 0
                  ? run.purchase_run_items?.map((item) => `${item.item_name} × ${item.quantity}`).join(' / ')
                  : run.note?.split(' / ')[0] || '立替';
              const statusLabel =
                run.reimbursement_status === 'reimbursed' ? '精算済み' : '未精算';

              return (
                <div key={run.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px_160px] md:items-center">
                  <div className="space-y-1">
                    <p className="font-medium text-white">{label}</p>
                    <p className="text-sm text-gray-500">
                      {run.vendor || '購入先未入力'}
                      {run.note ? ` ・ ${run.note}` : ''}
                    </p>
                  </div>
                  <p className="font-mono text-white">¥{run.total_amount.toLocaleString()}</p>
                  <span
                    className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${
                      run.reimbursement_status === 'reimbursed'
                        ? 'bg-green-500/15 text-green-300'
                        : 'bg-sky-500/15 text-sky-300'
                    }`}
                  >
                    {statusLabel}
                  </span>
                  <p className="text-xs text-gray-500">
                    {format(new Date(run.created_at), 'M/d HH:mm', { locale: ja })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
