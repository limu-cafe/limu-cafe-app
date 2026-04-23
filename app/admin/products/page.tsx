import Link from 'next/link';
import { Archive, ArrowRight, Package, Search, type LucideIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminProductsHubPage() {
  const supabase = createAdminClient();

  const [{ count: totalItems }, { count: availableItems }, { data: lowStockItems }] =
    await Promise.all([
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
        .limit(6),
    ]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Products workspace
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white">商品・在庫</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-400">
          商品に関する作業は、ここから「商品設定」「入荷・仕入れ」「価格確認」に分けて進めます。
          何を直したいかで入口を分けているので、迷ったら下の説明から選べます。
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="登録商品" value={`${totalItems ?? 0}件`} />
        <MetricCard label="販売中" value={`${availableItems ?? 0}件`} />
        <MetricCard label="補充候補" value={`${lowStockItems?.length ?? 0}件`} />
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        <ActionCard
          href="/admin/items"
          icon={Package}
          title="商品設定"
          description="商品名、英語名、価格、画像、カテゴリ、表示設定を編集するときはこちらです。"
          bullets={[
            '商品マスタを直したい',
            '価格や販売可否を変えたい',
            '画像や英語名を設定したい',
          ]}
        />
        <ActionCard
          href="/admin/stock"
          icon={Archive}
          title="入荷・仕入れ入力"
          description="在庫を増やす、仕入れ額を記録する、雑費を入れる現場作業はこちらです。"
          bullets={[
            '商品を補充したい',
            '仕入れ合計額を入力したい',
            '雑費を記録したい',
          ]}
        />
        <ActionCard
          href="/admin/price-watch"
          icon={Search}
          title="価格監視"
          description="外部価格の確認や監視対象の整理をしたいときに使います。"
          bullets={[
            '買い出し前に価格を見たい',
            '監視対象を登録したい',
            '価格比較を見返したい',
          ]}
          badge="開発中"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">不足している商品</h2>
          <p className="mt-1 text-sm text-gray-400">
            補充が必要そうなものだけを先に見て、すぐ在庫入力へ進めます。
          </p>
          <div className="mt-4 space-y-3">
            {!lowStockItems || lowStockItems.length === 0 ? (
              <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                いま急ぎで補充したい商品はありません。
              </p>
            ) : (
              lowStockItems.map((item: any) => (
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
                    入荷を記録
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">迷ったらここを見てください</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-gray-300">
            <InfoRow label="商品の見た目や設定を変える">商品設定</InfoRow>
            <InfoRow label="商品を補充したり仕入れ額を入れる">入荷・仕入れ入力</InfoRow>
            <InfoRow label="外部価格を確認したい">価格監視</InfoRow>
          </div>
          <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <p className="text-sm font-medium text-white">よくある流れ</p>
            <ol className="mt-3 space-y-2 text-sm text-gray-400">
              <li>1. まず不足商品を確認する</li>
              <li>2. 入荷・仕入れ入力で在庫と金額を記録する</li>
              <li>3. 必要なら商品設定で価格や表示を更新する</li>
            </ol>
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
  badge,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:bg-gray-800/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-white/5 p-2 text-white">
          <Icon size={18} />
        </div>
        {badge ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            {badge}
          </span>
        ) : null}
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
      <ul className="mt-4 space-y-2 text-sm text-gray-300">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-300" />
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
