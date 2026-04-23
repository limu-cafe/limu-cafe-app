'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  Banknote,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { clearAdminSession } from './AdminAuthGuard';

type NotificationKey =
  | 'products'
  | 'payments'
  | 'operations'
  | 'stock'
  | 'orders'
  | 'charges'
  | 'users'
  | 'points'
  | 'requests'
  | 'legacy';

type SidebarNotifications = Record<NotificationKey, number>;

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  notificationKey?: NotificationKey;
  badge?: string;
};

type NavGroup = {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  notificationKey?: NotificationKey;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: 'products',
    label: '商品・在庫',
    href: '/admin/products',
    icon: Package,
    notificationKey: 'products',
    items: [
      { href: '/admin/items', label: '商品管理', icon: Package },
      { href: '/admin/stock', label: '在庫入力', icon: Archive, notificationKey: 'stock' },
      { href: '/admin/price-watch', label: '価格監視', icon: Search, badge: '開発中' },
    ],
  },
  {
    id: 'payments',
    label: '注文・決済',
    href: '/admin/payments',
    icon: Wallet,
    notificationKey: 'payments',
    items: [
      { href: '/admin/orders', label: '注文一覧', icon: ShoppingBag, notificationKey: 'orders' },
      { href: '/admin/charge', label: 'チャージ記録', icon: Wallet, notificationKey: 'charges' },
      { href: '/admin/settlement', label: '精算管理', icon: BarChart3 },
    ],
  },
  {
    id: 'cashbox',
    label: '会計・金庫',
    href: '/admin/cashbox',
    icon: Banknote,
    items: [
      { href: '/admin/cashbox', label: '金庫管理', icon: Banknote },
    ],
  },
  {
    id: 'operations',
    label: 'ユーザー・運営',
    href: '/admin/operations',
    icon: Sparkles,
    notificationKey: 'operations',
    items: [
      { href: '/admin/users', label: 'ユーザー管理', icon: Users, notificationKey: 'users' },
      { href: '/admin/points', label: 'ポイント管理', icon: Sparkles, notificationKey: 'points' },
      { href: '/admin/requests', label: '商品要望', icon: MessageSquare, notificationKey: 'requests' },
      { href: '/admin/legacy', label: '旧データ移行', icon: ClipboardList, notificationKey: 'legacy' },
      { href: '/admin/audit', label: '監査ログ', icon: ClipboardList },
    ],
  },
];

export default function AdminSidebar({
  notifications,
}: {
  notifications: SidebarNotifications;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearAdminSession();
    router.push('/admin/login');
  };

  const isCurrent = (href: string) => pathname === href;

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      <div className="border-b border-gray-800 p-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">☕</span>
          <div>
            <p className="font-display text-lg font-bold leading-none text-white">LIMU喫茶</p>
            <p className="mt-0.5 text-xs text-gray-400">管理者画面</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-4">
        <SidebarLink href="/admin" active={pathname === '/admin'} icon={LayoutDashboard} label="全体案内" />

        {navGroups.map((group) => {
          const groupActive = group.href ? pathname === group.href : false;
          const groupCount = group.notificationKey ? notifications[group.notificationKey] : 0;

          return (
            <section key={group.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <group.icon size={14} className="text-gray-500" />
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                  {group.label}
                </span>
                {groupCount > 0 && (
                  <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                    {groupCount > 99 ? '99+' : groupCount}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {group.href ? (
                  <SidebarLink
                    href={group.href}
                    active={groupActive}
                    icon={group.icon}
                    label={`${group.label}の入口`}
                  />
                ) : null}

                {group.items.map((item) => {
                  const count = item.notificationKey ? notifications[item.notificationKey] : 0;
                  const destination =
                    item.notificationKey && count > 0 ? `${item.href}?pending=1` : item.href;

                  return (
                    <SidebarLink
                      key={item.href}
                      href={destination}
                      active={isCurrent(item.href)}
                      icon={item.icon}
                      label={item.label}
                      badge={item.badge}
                      count={count}
                      compact
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <Link
          href="/"
          className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-gray-200"
        >
          <ArrowLeft size={17} />
          ユーザー画面へ戻る
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-gray-200"
        >
          <LogOut size={17} />
          管理者ログアウト
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  active,
  icon: Icon,
  label,
  badge,
  count,
  compact = false,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  badge?: string;
  count?: number;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 ${compact ? 'py-2.5' : 'py-3'} text-sm font-medium transition-all duration-200 ${
        active
          ? 'bg-white/10 text-white'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
      }`}
    >
      <Icon size={17} />
      <span className="flex-1">{label}</span>
      {count && count > 0 ? (
        <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      {badge ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
