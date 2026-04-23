import Link from 'next/link';
import { format, endOfMonth, startOfMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  PackagePlus,
  Receipt,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type MonthlyOrderRow = {
  total_amount: number;
};

type PendingTask = {
  title: string;
  description: string;
  count: number;
  href: string;
  tone: 'amber' | 'blue' | 'emerald' | 'violet' | 'rose';
};

type RestockTask = {
  id: string;
  name: string;
  stock: number;
  stock_alert_threshold: number;
};

type PendingAdvance = {
  id: string;
  total_amount: number;
  vendor: string | null;
  created_at: string;
  purchase_run_items: Array<{
    item_name: string;
    quantity: number;
  }> | null;
};

type PurchaseAmountRow = {
  total_amount: number;
};

type CashboxCountRow = {
  actual_amount: number;
  counted_at: string;
};

const toneClassNames: Record<PendingTask['tone'], string> = {
  amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  blue: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  violet: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  rose: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
};

export default async function AdminDashboard() {
  const supabase = createAdminClient();
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();

  const [
    { count: pendingCashOrders },
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { data: lowStockItems },
    { data: monthlyOrders },
    { data: latestCashboxCount },
    { data: pendingAdvanceRuns },
    { data: monthlyPurchaseRuns },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_method', 'cash')
      .eq('payment_status', 'pending'),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', false)
      .eq('is_active', true),
    supabase
      .from('item_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('legacy_transfer_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('items')
      .select('id, name, stock, stock_alert_threshold')
      .eq('is_available', true)
      .filter('stock', 'lte', 'stock_alert_threshold')
      .order('stock', { ascending: true })
      .limit(4),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('payment_status', 'completed')
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd),
    supabase
      .from('cashbox_counts')
      .select('actual_amount, counted_at')
      .order('counted_at', { ascending: false })
      .limit(1),
    supabase
      .from('purchase_runs')
      .select('id, total_amount, vendor, created_at, purchase_run_items(item_name, quantity)')
      .eq('reimbursement_status', 'pending_reimbursement')
      .order('created_at', { ascending: true })
      .limit(3),
    supabase
      .from('purchase_runs')
      .select('total_amount')
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd),
  ]);

  const pendingTasks: PendingTask[] = [
    {
      title: '現金注文の確認',
      description: '受け取り済みかだけ確認して押せば完了です。',
      count: pendingCashOrders ?? 0,
      href: '/admin/orders?pending=1',
      tone: 'amber',
    },
    {
      title: '要望の判断',
      description: '要望を見て採用・保留・却下を決めます。',
      count: pendingRequests ?? 0,
      href: '/admin/requests?pending=1',
      tone: 'violet',
    },
    {
      title: 'ユーザー承認',
      description: '研究室メンバーか確認して承認します。',
      count: pendingUsers ?? 0,
      href: '/admin/users?pending=1',
      tone: 'emerald',
    },
    {
      title: '旧データ引き継ぎ',
      description: '照合して承認すれば残高とお気に入りを反映します。',
      count: pendingLegacyTransfers ?? 0,
      href: '/admin/legacy',
      tone: 'rose',
    },
  ];

  const actionableTasks = pendingTasks.filter((task) => task.count > 0);
  const monthlyRevenue =
    ((monthlyOrders ?? []) as MonthlyOrderRow[]).reduce(
      (sum, order) => sum + order.total_amount,
      0
    );
  const lastCashboxCount = ((latestCashboxCount ?? []) as CashboxCountRow[])[0] ?? null;
  const monthlyPurchaseAmount =
    ((monthlyPurchaseRuns ?? []) as PurchaseAmountRow[]).reduce(
      (sum, run) => sum + run.total_amount,
      0
    );
  const pendingAdvanceAmount =
    ((pendingAdvanceRuns ?? []) as PendingAdvance[]).reduce(
      (sum, run) => sum + run.total_amount,
      0
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-gray-500 uppercase">
            Admin Desk
          </p>
          <h1 className="font-display text-3xl font-bold text-white">
            今日やること
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {format(now, 'M月d日（E）', { locale: ja })}。管理者は判断と現場対応だけで回せるようにしています。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <SummaryCard
            label="今月の売上"
            value={`¥${monthlyRevenue.toLocaleString()}`}
            hint="完了済み注文"
            icon={<Wallet size={16} className="text-emerald-300" />}
          />
          <SummaryCard
            label="最新の金庫実測"
            value={lastCashboxCount ? `¥${lastCashboxCount.actual_amount.toLocaleString()}` : '未記録'}
            hint={lastCashboxCount ? format(new Date(lastCashboxCount.counted_at), 'M/d HH:mm', { locale: ja }) : '金庫管理で記録'}
            icon={<Banknote size={16} className="text-sky-300" />}
          />
          <SummaryCard
            label="未精算の立替"
            value={`¥${pendingAdvanceAmount.toLocaleString()}`}
            hint="返金待ち"
            icon={<Receipt size={16} className="text-amber-300" />}
          />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <h2 className="text-lg font-semibold text-white">承認待ち</h2>
        </div>
        {actionableTasks.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
            いま承認待ちはありません。買い出しと精算の確認だけ見れば大丈夫です。
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {actionableTasks.map((task) => (
              <Link
                key={task.title}
                href={task.href}
                className={`rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${toneClassNames[task.tone]}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium tracking-[0.18em] uppercase opacity-75">
                      要対応
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">{task.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-200/90">{task.description}</p>
                  </div>
                  <div className="rounded-xl bg-black/20 px-3 py-2 text-right">
                    <p className="text-[11px] text-gray-300">件数</p>
                    <p className="font-display text-2xl font-bold text-white">{task.count}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 text-sm font-medium text-white">
                  開く
                  <ArrowRight size={15} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {[
          {
            href: '/admin/products',
            title: '商品・在庫',
            description: '商品マスタ、入荷、価格確認をまとめて辿れます。',
          },
          {
            href: '/admin/payments',
            title: '注文・決済',
            description: '注文確認、チャージ記録、後払い精算の入口です。',
          },
          {
            href: '/admin/operations',
            title: 'ユーザー・運営',
            description: 'ユーザー管理、ポイント、要望、引き継ぎをまとめています。',
          },
        ].map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:bg-gray-800/70"
          >
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Hub</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">{section.description}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackagePlus size={18} className="text-amber-300" />
              <h2 className="text-lg font-semibold text-white">買い出し・補充</h2>
            </div>
            <Link href="/admin/products" className="text-sm text-gray-400 hover:text-white">
              商品・在庫ハブへ
            </Link>
          </div>
          {!lowStockItems || lowStockItems.length === 0 ? (
            <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              いま急ぎで買い出しが必要な商品はありません。
            </p>
          ) : (
            <div className="space-y-3">
              {(lowStockItems as RestockTask[]).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-950/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-base font-medium text-white">{item.name}</p>
                    <p className="mt-1 text-sm text-gray-400">
                      {item.stock === 0
                        ? '売り切れです。補充すると自動で購入可能に戻ります。'
                        : `残り ${item.stock}個 / 目安 ${item.stock_alert_threshold}個`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        item.stock === 0
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {item.stock === 0 ? '売り切れ' : '要補充'}
                    </span>
                    <Link
                      href="/admin/stock"
                      className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-950 hover:bg-gray-100"
                    >
                      補充する
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={18} className="text-sky-300" />
              <h2 className="text-lg font-semibold text-white">精算・お金まわり</h2>
            </div>
            <Link href="/admin/payments" className="text-sm text-gray-400 hover:text-white">
              注文・決済ハブへ
            </Link>
          </div>
          <div className="grid gap-3">
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
              <p className="text-sm text-gray-400">今月の仕入れ総額</p>
              <p className="mt-2 font-display text-2xl font-bold text-white">
                ¥{monthlyPurchaseAmount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
              <p className="text-sm text-gray-400">未精算の立替</p>
              <p className="mt-2 font-display text-2xl font-bold text-amber-300">
                ¥{pendingAdvanceAmount.toLocaleString()}
              </p>
            </div>
            {!pendingAdvanceRuns || pendingAdvanceRuns.length === 0 ? (
              <p className="text-sm text-gray-500">返金待ちの立替はありません。</p>
            ) : (
              <div className="space-y-3">
                {(pendingAdvanceRuns as PendingAdvance[]).map((run) => (
                  <div key={run.id} className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {run.vendor || '購入先未入力'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {format(new Date(run.created_at), 'M/d HH:mm')}
                        </p>
                        <p className="mt-2 text-sm text-gray-400">
                          {(run.purchase_run_items ?? [])
                            .slice(0, 2)
                            .map((item) => `${item.item_name} ×${item.quantity}`)
                            .join(' / ') || '仕入れ明細なし'}
                        </p>
                      </div>
                      <p className="font-display text-lg font-bold text-white">
                        ¥{run.total_amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-emerald-300" />
            <h2 className="text-lg font-semibold text-white">履歴を見る</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: '/admin/products',
                title: '商品・在庫',
                description: '商品マスタ編集や入荷入力へ進む',
              },
              {
                href: '/admin/payments',
                title: '注文・決済',
                description: '注文確認、チャージ、精算関連を見る',
              },
              {
                href: '/admin/operations',
                title: 'ユーザー・運営',
                description: 'ユーザー、ポイント、要望、旧データ移行を見る',
              },
              {
                href: '/admin/audit',
                title: '監査ログ',
                description: '管理操作の履歴を見る',
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 transition-colors hover:bg-gray-900"
              >
                <p className="font-medium text-white">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-gray-400">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gray-800">
        {icon}
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}
