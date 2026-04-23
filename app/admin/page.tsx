import Link from 'next/link';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  ArrowRight,
  Banknote,
  ClipboardList,
  MessageSquare,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type LowStockItem = {
  id: string;
  name: string;
  stock: number;
  stock_alert_threshold: number;
};

type PendingAdvance = {
  id: string;
  total_amount: number;
  vendor: string | null;
  purchase_run_items: Array<{
    item_name: string;
    quantity: number;
  }> | null;
};

export default async function AdminDashboard() {
  const supabase = createAdminClient();
  const today = new Date();

  const [
    { count: pendingCashOrders },
    { count: pendingChargeRequests },
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { count: deferredUsers },
    { count: totalItems },
    { count: availableItems },
    { data: lowStockItems },
    { data: pendingAdvanceRuns },
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
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('deferred_balance', 0)
      .eq('is_active', true),
    supabase.from('items').select('*', { count: 'exact', head: true }),
    supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('is_available', true),
    supabase
      .from('items')
      .select('id, name, stock, stock_alert_threshold')
      .eq('is_available', true)
      .filter('stock', 'lte', 'stock_alert_threshold')
      .order('stock', { ascending: true })
      .limit(4),
    supabase
      .from('purchase_runs')
      .select('id, total_amount, vendor, purchase_run_items(item_name, quantity)')
      .eq('reimbursement_status', 'pending_reimbursement')
      .order('created_at', { ascending: true })
      .limit(3),
  ]);

  const urgentTasks: Array<{
    title: string;
    description: string;
    count: number;
    href: string;
    icon: LucideIcon;
    tone: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose';
  }> = [
    {
      title: '現金注文の確認',
      description: '受け渡し確認、取消、返金をここから進めます。',
      count: pendingCashOrders ?? 0,
      href: pendingCashOrders ? '/admin/orders?pending=1' : '/admin/orders',
      icon: ShoppingBag,
      tone: 'amber',
    },
    {
      title: 'チャージ未処理',
      description: '旧方式チャージの確認と返金処理です。',
      count: pendingChargeRequests ?? 0,
      href: pendingChargeRequests ? '/admin/charge?pending=1' : '/admin/charge',
      icon: Wallet,
      tone: 'sky',
    },
    {
      title: '承認待ちユーザー',
      description: '研究室メンバーの承認と状態確認です。',
      count: pendingUsers ?? 0,
      href: pendingUsers ? '/admin/users?pending=1' : '/admin/users',
      icon: Users,
      tone: 'emerald',
    },
    {
      title: '商品要望の判断',
      description: '採用・却下・コメント確認を進めます。',
      count: pendingRequests ?? 0,
      href: pendingRequests ? '/admin/requests?pending=1' : '/admin/requests',
      icon: MessageSquare,
      tone: 'violet',
    },
    {
      title: '旧データ引き継ぎ',
      description: '申請内容の照合と反映を行います。',
      count: pendingLegacyTransfers ?? 0,
      href: pendingLegacyTransfers ? '/admin/legacy?pending=1' : '/admin/legacy',
      icon: ClipboardList,
      tone: 'rose',
    },
  ];

  const operationGroups = [
    {
      title: '商品・在庫',
      description: '商品情報を整える、入荷を入力する、価格を確認する。',
      href: '/admin/products',
      icon: Package,
      stats: [
        { label: '登録商品', value: `${totalItems ?? 0}件` },
        { label: '販売中', value: `${availableItems ?? 0}件` },
        { label: '補充候補', value: `${lowStockItems?.length ?? 0}件` },
      ],
      quickLinks: [
        { label: '商品設定を開く', href: '/admin/items' },
        { label: '入荷・仕入れ入力へ', href: '/admin/stock' },
      ],
    },
    {
      title: '注文・決済',
      description: '注文確認、チャージ、後払い精算、金庫確認を扱います。',
      href: '/admin/payments',
      icon: Wallet,
      stats: [
        { label: '現金注文', value: `${pendingCashOrders ?? 0}件` },
        { label: '未処理チャージ', value: `${pendingChargeRequests ?? 0}件` },
        { label: '後払い残高あり', value: `${deferredUsers ?? 0}人` },
      ],
      quickLinks: [
        { label: '注文一覧を開く', href: '/admin/orders' },
        { label: '金庫管理を開く', href: '/admin/cashbox' },
      ],
    },
    {
      title: 'ユーザー・運営',
      description: 'ユーザー承認、ポイント、要望、旧データ移行、監査ログです。',
      href: '/admin/operations',
      icon: Sparkles,
      stats: [
        { label: '承認待ち', value: `${pendingUsers ?? 0}件` },
        { label: '要望待ち', value: `${pendingRequests ?? 0}件` },
        { label: '引き継ぎ待ち', value: `${pendingLegacyTransfers ?? 0}件` },
      ],
      quickLinks: [
        { label: 'ポイント管理を開く', href: '/admin/points' },
        { label: 'ユーザー一覧を開く', href: '/admin/users' },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Admin home
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-white">管理トップ</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-400">
          {format(today, 'M月d日（E）', { locale: ja })}
          。「今すぐ対応」と「何をしたいか」の2軸で迷わず辿れるように整理しています。
          今日の作業が決まっていないときは、まずここから始めれば大丈夫です。
        </p>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={Receipt}
          title="今すぐ対応"
          description="件数があるものだけを先に処理できるように並べています。"
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {urgentTasks.map((task) => (
            <UrgentTaskCard key={task.title} {...task} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={ArrowRight}
          title="何をしたいですか？"
          description="作業のまとまりごとに入口を分けています。"
        />
        <div className="grid gap-5 xl:grid-cols-3">
          {operationGroups.map((group) => (
            <OperationGroupCard key={group.title} {...group} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <SectionHeading
            icon={Package}
            title="いま補充したい商品"
            description="在庫入力に進む前に、足りない商品だけ素早く確認できます。"
            compact
          />
          <div className="mt-4 space-y-3">
            {!lowStockItems || lowStockItems.length === 0 ? (
              <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                いま急ぎで補充したい商品はありません。
              </p>
            ) : (
              (lowStockItems as LowStockItem[]).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">{item.name}</p>
                    <p className="text-sm text-gray-400">
                      残り {item.stock}個 / 目安 {item.stock_alert_threshold}個
                    </p>
                  </div>
                  <Link
                    href="/admin/stock"
                    className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-950 hover:bg-gray-100"
                  >
                    補充する
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <SectionHeading
            icon={Banknote}
            title="返金待ち・立替"
            description="現金の動きが発生するものをまとめて見られます。"
            compact
          />
          <div className="mt-4 space-y-3">
            {!pendingAdvanceRuns || pendingAdvanceRuns.length === 0 ? (
              <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-400">
                現在、返金待ちの立替はありません。
              </p>
            ) : (
              (pendingAdvanceRuns as PendingAdvance[]).map((run) => (
                <div key={run.id} className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{run.vendor || '購入先未入力'}</p>
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
              ))
            )}
            <Link
              href="/admin/cashbox"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white"
            >
              金庫管理へ
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'space-y-1'}>
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-amber-300" />
        <h2 className={`${compact ? 'text-lg' : 'text-xl'} font-semibold text-white`}>{title}</h2>
      </div>
      <p className={`${compact ? 'mt-1' : ''} text-sm text-gray-400`}>{description}</p>
    </div>
  );
}

function UrgentTaskCard({
  title,
  description,
  count,
  href,
  icon: Icon,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose';
}) {
  const toneClassName: Record<typeof tone, string> = {
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    sky: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    violet: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
  };

  return (
    <Link
      href={href}
      className="rounded-2xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:bg-gray-800/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-2xl border px-3 py-3 ${toneClassName[tone]}`}>
          <Icon size={20} />
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-gray-300">
          {count}件
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gray-300">
        この画面を開く
        <ArrowRight size={15} />
      </div>
    </Link>
  );
}

function OperationGroupCard({
  title,
  description,
  href,
  icon: Icon,
  stats,
  quickLinks,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  stats: Array<{ label: string; value: string }>;
  quickLinks: Array<{ label: string; href: string }>;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white/5 p-3 text-white">
          <Icon size={20} />
        </div>
        <Link href={href} className="text-sm font-medium text-gray-300 hover:text-white">
          まとめて見る
        </Link>
      </div>
      <h3 className="mt-4 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-300 hover:bg-gray-950"
          >
            <span>{link.label}</span>
            <ArrowRight size={15} />
          </Link>
        ))}
      </div>
    </div>
  );
}
