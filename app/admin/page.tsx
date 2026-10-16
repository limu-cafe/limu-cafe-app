import { requireAdminPage } from '@/lib/admin-page-session';
import Link from 'next/link';
import { getAdminOverview } from '@/lib/admin-queries';
import { ADMIN_NAVIGATION } from '@/lib/admin-navigation';
import { describeCashCollectionBreakdown } from '@/lib/cash-collection';
import BotIntroBroadcastCard from './operations/BotIntroBroadcastCard';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  await requireAdminPage();
  const overview = await getAdminOverview();
  const notifications = overview.notifications;
  const cashCollectionEntries = overview.collections;
  const cards = ADMIN_NAVIGATION.flatMap((section) => section.items).filter((item) => item.href !== '/admin').map((item) => ({
    ...item, title: item.label, count: item.notificationKey ? notifications[item.notificationKey] : item.href === '/admin/subscriptions' ? overview.activeSubscriptions : undefined,
  }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">管理トップ</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ href, icon: Icon, title, count }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 transition-colors hover:bg-gray-800/70"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-white">
                <Icon size={16} />
                <span className="font-medium">{title}</span>
              </div>
              {(count ?? 0) > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {count}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">
            要回収一覧
          </h2>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
            {cashCollectionEntries.length}人
          </span>
        </div>
        {cashCollectionEntries.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-500">要回収のユーザーはいません</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {cashCollectionEntries.map((entry) => (
              <Link
                key={entry.userId}
                href={`/admin/transactions?user=${encodeURIComponent(entry.userId)}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-gray-800/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{entry.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {describeCashCollectionBreakdown(entry)}
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold text-amber-300">
                  ¥{entry.totalAmount.toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <BotIntroBroadcastCard
        eligibleCount={overview.botIntroUsers.length}
        eligibleUsers={overview.botIntroUsers}
      />
    </div>
  );
}
