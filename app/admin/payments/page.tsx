import Link from 'next/link';
import { BarChart3, ShoppingBag, Wallet, type LucideIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentsHubPage() {
  const supabase = createAdminClient();

  const [
    { count: pendingCashOrders },
    { count: pendingChargeRequests },
    { count: deferredUsers },
    { data: pendingChargeAmountRows },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_method', 'cash')
      .eq('payment_status', 'pending'),
    supabase
      .from('charge_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('deferred_balance', 0)
      .eq('is_active', true),
    supabase
      .from('charge_requests')
      .select('amount')
      .eq('status', 'pending'),
  ]);

  const pendingChargeAmount = (pendingChargeAmountRows ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + row.amount,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Admin Hub</p>
        <h1 className="font-display text-3xl font-bold text-white">注文・決済</h1>
        <p className="mt-2 text-sm text-gray-400">
          注文確認、チャージ履歴、後払い精算をこのまとまりから扱えます。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="現金注文の未確認" value={`${pendingCashOrders ?? 0}件`} />
        <MetricCard label="旧方式チャージ未処理" value={`${pendingChargeRequests ?? 0}件`} />
        <MetricCard label="後払い残高あり" value={`${deferredUsers ?? 0}人`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HubLink
          href="/admin/orders"
          icon={ShoppingBag}
          title="注文一覧"
          description="注文内容、返金、現金受け取り確認、後払い注文の確認を行います。"
        />
        <HubLink
          href="/admin/charge"
          icon={Wallet}
          title="チャージ記録"
          description="チャージ履歴や旧方式の承認待ち、返金処理を確認します。"
        />
        <HubLink
          href="/admin/settlement"
          icon={BarChart3}
          title="精算管理"
          description="後払い残高の精算、精算履歴、リマインド設定を確認します。"
        />
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">いま確認したいもの</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Link href="/admin/orders?pending=1" className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 hover:bg-gray-950">
            <p className="text-sm font-medium text-white">現金注文の確認</p>
            <p className="mt-1 text-sm text-gray-400">{pendingCashOrders ?? 0}件が受け取り確認待ちです。</p>
          </Link>
          <Link href="/admin/charge?pending=1" className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 hover:bg-gray-950">
            <p className="text-sm font-medium text-white">チャージ未処理</p>
            <p className="mt-1 text-sm text-gray-400">
              {pendingChargeRequests ?? 0}件 / 合計 ¥{pendingChargeAmount.toLocaleString()}
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function HubLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:bg-gray-800/70"
    >
      <div className="rounded-xl bg-white/5 p-2 text-white w-fit">
        <Icon size={18} />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
    </Link>
  );
}
