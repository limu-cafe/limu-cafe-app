import Link from 'next/link';
import { ArrowRight, BarChart3, Banknote, ShoppingBag, Wallet, type LucideIcon } from 'lucide-react';
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
    supabase.from('charge_requests').select('amount').eq('status', 'pending'),
  ]);

  const pendingChargeAmount = (pendingChargeAmountRows ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + row.amount,
    0
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Payments workspace
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white">注文・決済</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-400">
          注文確認、チャージ、後払い精算、金庫確認を「いま何をしたいか」で辿れるようにしています。
          受け渡し確認や返金など、お金が動く処理はここから探すと分かりやすいです。
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="現金注文の未確認" value={`${pendingCashOrders ?? 0}件`} />
        <MetricCard label="旧方式チャージ未処理" value={`${pendingChargeRequests ?? 0}件`} />
        <MetricCard label="後払い残高あり" value={`${deferredUsers ?? 0}人`} />
      </div>

      <section className="grid gap-4 xl:grid-cols-4">
        <ActionCard
          href="/admin/orders"
          icon={ShoppingBag}
          title="注文一覧"
          description="現金注文の確認、返金、キャンセル、注文内容の確認を行います。"
          bullets={['受け渡し済みの確認', '注文の返金', '注文キャンセル']}
        />
        <ActionCard
          href="/admin/charge"
          icon={Wallet}
          title="チャージ記録"
          description="チャージ履歴や旧方式の承認待ち、返金処理を確認します。"
          bullets={['チャージの履歴確認', '旧方式チャージの処理', 'チャージ返金']}
        />
        <ActionCard
          href="/admin/settlement"
          icon={BarChart3}
          title="精算管理"
          description="後払い残高、精算履歴、リマインド設定をまとめて扱います。"
          bullets={['後払い残高の確認', '精算済み履歴の確認', 'リマインド設定']}
        />
        <ActionCard
          href="/admin/cashbox"
          icon={Banknote}
          title="金庫管理"
          description="枚数入力、差額確認、現金の動きの整理を行います。"
          bullets={['実際の現金を数える', '差額を見る', '現金の出入りを確認']}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">いま確認したいもの</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Link
              href="/admin/orders?pending=1"
              className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 hover:bg-gray-950"
            >
              <p className="text-sm font-medium text-white">現金注文の確認</p>
              <p className="mt-1 text-sm text-gray-400">
                {pendingCashOrders ?? 0}件が受け取り確認待ちです。
              </p>
            </Link>
            <Link
              href="/admin/charge?pending=1"
              className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 hover:bg-gray-950"
            >
              <p className="text-sm font-medium text-white">チャージ未処理</p>
              <p className="mt-1 text-sm text-gray-400">
                {pendingChargeRequests ?? 0}件 / 合計 ¥{pendingChargeAmount.toLocaleString()}
              </p>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">迷ったらここを見てください</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-gray-300">
            <InfoRow label="注文の受け渡しや返金">注文一覧</InfoRow>
            <InfoRow label="チャージ周りの確認">チャージ記録</InfoRow>
            <InfoRow label="後払いの整理">精算管理</InfoRow>
            <InfoRow label="現金の実測と差額確認">金庫管理</InfoRow>
          </div>
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

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  bullets,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
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
      <ul className="mt-4 space-y-2 text-sm text-gray-300">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-300" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gray-300">
        この画面を開く
        <ArrowRight size={15} />
      </div>
    </Link>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm text-white">{children}</p>
    </div>
  );
}
