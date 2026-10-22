import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { isPendingCashOrder, isPendingDeferredOrder, orderStateLabel, paymentLabel, type AdminOrder } from '@/lib/admin-objects';

export default function OrderRecord({ order, returnTo }: { order: AdminOrder; returnTo?: string }) {
  const pending = isPendingCashOrder(order) || isPendingDeferredOrder(order);
  const date = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(order.created_at));
  return <Link prefetch={false} href={`/admin/orders/${order.id}${returnTo ? `?from=${encodeURIComponent(returnTo)}` : ''}`} className="grid gap-3 border-b border-gray-800 px-3 py-4 transition hover:bg-gray-900 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0"><p className="wrap-break-word text-sm font-medium text-white">{order.order_items?.map((item) => `${item.item_name} × ${item.quantity}`).join(' / ') || '明細なし'}</p><p className="mt-2 text-xs text-gray-400">{order.user?.name ?? '注文'} · {date} · {paymentLabel(order.payment_method)}</p></div>
    <div className="flex items-center gap-4"><span className={`rounded-full px-2 py-1 text-xs ${pending ? 'bg-amber-500/10 text-amber-300' : 'bg-gray-800 text-gray-300'}`}>{orderStateLabel(order)}</span><span className="min-w-16 text-right font-mono text-white">¥{order.total_amount.toLocaleString()}</span><ChevronRight aria-hidden size={15} className="text-gray-500"/></div>
  </Link>;
}
