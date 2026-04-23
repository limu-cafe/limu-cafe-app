import Link from 'next/link';
import { Archive, Package, Search, type LucideIcon } from 'lucide-react';
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
        .limit(5),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Admin Hub</p>
        <h1 className="font-display text-3xl font-bold text-white">商品・在庫</h1>
        <p className="mt-2 text-sm text-gray-400">
          商品マスタ編集、入荷入力、価格確認をここからまとめて辿れます。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="登録商品数" value={`${totalItems ?? 0}件`} />
        <MetricCard label="販売中" value={`${availableItems ?? 0}件`} />
        <MetricCard label="要補充" value={`${lowStockItems?.length ?? 0}件`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HubLink
          href="/admin/items"
          icon={Package}
          title="商品管理"
          description="商品名、英語名、価格、画像、販売可否などのマスタ編集を行います。"
        />
        <HubLink
          href="/admin/stock"
          icon={Archive}
          title="在庫入力"
          description="入荷、仕入れ記録、雑費入力など現場オペレーションをまとめて行います。"
        />
        <HubLink
          href="/admin/price-watch"
          icon={Search}
          title="価格監視"
          description="価格の確認や監視対象の管理を行います。"
          badge="開発中"
        />
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">今すぐ補充したい商品</h2>
            <p className="mt-1 text-sm text-gray-400">在庫入力に進む前の確認用です。</p>
          </div>
          <Link href="/admin/stock?pending=1" className="text-sm text-gray-400 hover:text-white">
            在庫入力へ
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {!lowStockItems || lowStockItems.length === 0 ? (
            <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              いま急ぎの補充対象はありません。
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
                  補充する
                </Link>
              </div>
            ))
          )}
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
  badge,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
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
    </Link>
  );
}
