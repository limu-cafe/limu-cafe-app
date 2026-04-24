'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Repeat2,
  Receipt,
  ScrollText,
  Users,
  Vault,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { clearAdminSession } from './AdminAuthGuard';

type NotificationKey =
  | 'items'
  | 'reimbursements'
  | 'transactions'
  | 'users'
  | 'points'
  | 'requests'
  | 'legacy';

type SidebarNotifications = Record<NotificationKey, number>;

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

export default function AdminSidebar({
  notifications,
}: {
  notifications: SidebarNotifications;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const sections: NavSection[] = [
    {
      label: '基本',
      items: [
        { href: '/admin', label: '管理トップ', icon: LayoutDashboard },
      ],
    },
    {
      label: '日常業務',
      items: [
        {
          href: '/admin/items',
          label: '商品管理',
          icon: Package,
          count: notifications.items,
        },
        {
          href: '/admin/subscriptions',
          label: 'サブスク管理',
          icon: Repeat2,
        },
        {
          href: '/admin/reimbursements',
          label: '立替管理',
          icon: ClipboardList,
          count: notifications.reimbursements,
        },
        {
          href: '/admin/transactions',
          label: '取引履歴',
          icon: Receipt,
          count: notifications.transactions,
        },
        { href: '/admin/cashbox', label: '金庫確認', icon: Vault },
      ],
    },
    {
      label: '運営',
      items: [
        {
          href: '/admin/users',
          label: 'ユーザー管理',
          icon: Users,
          count: notifications.users,
        },
        {
          href: '/admin/points',
          label: 'ポイント管理',
          icon: Coins,
          count: notifications.points,
        },
        {
          href: '/admin/requests',
          label: '商品要望',
          icon: MessageSquare,
          count: notifications.requests,
        },
        {
          href: '/admin/legacy',
          label: '旧データ移行',
          icon: Wallet,
          count: notifications.legacy,
        },
        { href: '/admin/audit', label: '監査ログ', icon: ScrollText },
      ],
    },
  ];

  const handleLogout = () => {
    clearAdminSession();
    router.push('/admin/login');
  };

  return (
    <aside className="h-screen w-72 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-950">
      <div className="border-b border-gray-800 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl">
            ☕
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-none text-white">LIMU喫茶</p>
            <p className="mt-1 text-xs text-gray-400">管理者画面</p>
          </div>
        </div>
      </div>

      <nav className="space-y-6 px-4 py-5">
        {sections.map((section) => (
          <section key={section.label} className="space-y-2">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-2xl px-3 py-3 text-sm transition-colors ${
                      active
                        ? 'bg-white text-gray-950'
                        : 'text-gray-300 hover:bg-gray-900 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={16} />
                      {item.label}
                    </span>
                    {(item.count ?? 0) > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          active ? 'bg-gray-950/10 text-gray-950' : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="space-y-2 border-t border-gray-800 px-4 py-4">
        <Link
          href="/"
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
        >
          <ArrowLeft size={16} />
          ユーザー画面へ戻る
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
        >
          <LogOut size={16} />
          管理者ログアウト
        </button>
      </div>
    </aside>
  );
}
