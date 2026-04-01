'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Package, Archive, ShoppingBag,
  Wallet, BarChart3, Users, MessageSquare, Search, LogOut, Banknote
} from 'lucide-react';
import { clearAdminSession } from './AdminAuthGuard';

type NotificationKey = 'stock' | 'orders' | 'charge' | 'users' | 'requests';

type SidebarNotifications = Record<NotificationKey, number>;

const navItems = [
  { href: '/admin', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/admin/items', label: '商品管理', icon: Package },
  { href: '/admin/stock', label: '在庫入力', icon: Archive, notificationKey: 'stock' as NotificationKey },
  { href: '/admin/orders', label: '注文一覧', icon: ShoppingBag, notificationKey: 'orders' as NotificationKey },
  { href: '/admin/charge', label: 'チャージ承認', icon: Wallet, notificationKey: 'charge' as NotificationKey },
  { href: '/admin/settlement', label: '精算管理', icon: BarChart3 },
  { href: '/admin/cashbox', label: '金庫管理', icon: Banknote },
  { href: '/admin/users', label: 'ユーザー管理', icon: Users, notificationKey: 'users' as NotificationKey },
  { href: '/admin/requests', label: '商品要望', icon: MessageSquare, notificationKey: 'requests' as NotificationKey },
  { href: '/admin/price-watch', label: '価格監視', icon: Search, badge: '開発中' },
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

  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col border-r border-gray-800">
      {/* ロゴ */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">☕</span>
          <div>
            <p className="font-display font-bold text-white text-lg leading-none">LIMU喫茶</p>
            <p className="text-xs text-gray-400 mt-0.5">管理者画面</p>
          </div>
        </div>
      </div>

      {/* ナビ */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, badge, notificationKey }) => {
          const isActive = pathname === href;
          const notificationCount = notificationKey ? notifications[notificationKey] : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <Icon size={17} />
              <span className="flex-1">{label}</span>
              {notificationCount > 0 && (
                <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
              {badge && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ログアウト */}
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-all"
        >
          <LogOut size={17} />
          管理者ログアウト
        </button>
      </div>
    </aside>
  );
}
