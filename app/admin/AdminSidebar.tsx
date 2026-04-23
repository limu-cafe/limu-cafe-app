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
  helper?: string;
  icon: LucideIcon;
  count?: number;
  badge?: string;
};

type NavSection = {
  label: string;
  description: string;
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
      label: 'いますぐ対応',
      description: '今日処理したいものをここから開きます。',
      items: [
        {
          href: '/admin',
          label: '管理トップ',
          helper: '全体の状況と優先タスク',
          icon: LayoutDashboard,
        },
        {
          href: notifications.orders > 0 ? '/admin/orders?pending=1' : '/admin/orders',
          label: '現金注文の確認',
          helper: '受け渡し確認と返金対応',
          icon: ShoppingBag,
          count: notifications.orders,
        },
        {
          href: notifications.charges > 0 ? '/admin/charge?pending=1' : '/admin/charge',
          label: 'チャージ未処理',
          helper: '履歴確認と返金対応',
          icon: Wallet,
          count: notifications.charges,
        },
        {
          href: notifications.users > 0 ? '/admin/users?pending=1' : '/admin/users',
          label: '承認待ちユーザー',
          helper: '研究室メンバー承認',
          icon: Users,
          count: notifications.users,
        },
        {
          href: notifications.requests > 0 ? '/admin/requests?pending=1' : '/admin/requests',
          label: '要望の確認',
          helper: '採用・却下・コメント確認',
          icon: MessageSquare,
          count: notifications.requests,
        },
        {
          href: notifications.legacy > 0 ? '/admin/legacy?pending=1' : '/admin/legacy',
          label: '旧データ引き継ぎ',
          helper: '申請内容の照合と反映',
          icon: ClipboardList,
          count: notifications.legacy,
        },
      ],
    },
    {
      label: '商品と仕入れ',
      description: '商品登録、在庫補充、価格確認を扱います。',
      items: [
        {
          href: '/admin/products',
          label: '商品・在庫の全体整理',
          helper: 'どこで何をするかの入口',
          icon: Package,
          count: notifications.products,
        },
        {
          href: '/admin/items',
          label: '商品設定',
          helper: '商品名・価格・画像・表示設定',
          icon: Package,
        },
        {
          href: '/admin/stock',
          label: '入荷・仕入れ入力',
          helper: '入荷、仕入れ額、雑費',
          icon: Archive,
          count: notifications.stock,
        },
        {
          href: '/admin/price-watch',
          label: '価格監視',
          helper: '価格調査と監視',
          icon: Search,
          badge: '開発中',
        },
      ],
    },
    {
      label: '注文とお金',
      description: '注文確認、チャージ、精算、金庫を扱います。',
      items: [
        {
          href: '/admin/payments',
          label: '注文・決済の全体整理',
          helper: '注文、チャージ、精算の入口',
          icon: Wallet,
          count: notifications.payments,
        },
        {
          href: '/admin/orders',
          label: '注文一覧',
          helper: '確認・返金・キャンセル',
          icon: ShoppingBag,
          count: notifications.orders,
        },
        {
          href: '/admin/charge',
          label: 'チャージ記録',
          helper: '反映履歴・返金',
          icon: Wallet,
          count: notifications.charges,
        },
        {
          href: '/admin/settlement',
          label: '精算管理',
          helper: '後払い精算と通知設定',
          icon: BarChart3,
        },
        {
          href: '/admin/cashbox',
          label: '金庫管理',
          helper: '実測・差額・現金の動き',
          icon: Banknote,
        },
      ],
    },
    {
      label: 'ユーザーと運営',
      description: 'ユーザー対応、ポイント、ログを扱います。',
      items: [
        {
          href: '/admin/operations',
          label: 'ユーザー・運営の全体整理',
          helper: '承認、ポイント、要望、移行の入口',
          icon: Sparkles,
          count: notifications.operations,
        },
        {
          href: '/admin/users',
          label: 'ユーザー管理',
          helper: '承認・残高・状態確認',
          icon: Users,
          count: notifications.users,
        },
        {
          href: '/admin/points',
          label: 'ポイント管理',
          helper: '付与率、キャンペーン、手動操作',
          icon: Sparkles,
          count: notifications.points,
        },
        {
          href: '/admin/requests',
          label: '商品要望',
          helper: '要望の判断と通知',
          icon: MessageSquare,
          count: notifications.requests,
        },
        {
          href: '/admin/legacy',
          label: '旧データ移行',
          helper: '引き継ぎ申請の反映',
          icon: ClipboardList,
          count: notifications.legacy,
        },
        {
          href: '/admin/audit',
          label: '監査ログ',
          helper: '管理操作の履歴',
          icon: ClipboardList,
        },
      ],
    },
  ];

  const handleLogout = () => {
    clearAdminSession();
    router.push('/admin/login');
  };

  return (
    <aside className="flex w-80 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-950">
      <div className="border-b border-gray-800 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl">
            ☕
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-none text-white">LIMU喫茶</p>
            <p className="mt-1 text-xs text-gray-400">管理者画面 / Admin desk</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-gray-400">
          何をどこで処理するかが迷いにくいように、業務ごとに入口を整理しています。
        </p>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        {sections.map((section) => (
          <section key={section.label} className="space-y-3">
            <div className="px-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                {section.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{section.description}</p>
            </div>

            <div className="space-y-1.5">
              {section.items.map((item) => (
                <SidebarLink
                  key={item.href + item.label}
                  href={item.href}
                  active={isPathActive(pathname, item.href)}
                  icon={item.icon}
                  label={item.label}
                  helper={item.helper}
                  count={item.count}
                  badge={item.badge}
                />
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <Link
          href="/"
          className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-gray-200"
        >
          <ArrowLeft size={17} />
          ユーザー画面へ戻る
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-gray-200"
        >
          <LogOut size={17} />
          管理者ログアウト
        </button>
      </div>
    </aside>
  );
}

function isPathActive(pathname: string, href: string) {
  const baseHref = href.split('?')[0];
  return pathname === baseHref;
}

function SidebarLink({
  href,
  active,
  icon: Icon,
  label,
  helper,
  badge,
  count,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  helper?: string;
  badge?: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-start gap-3 rounded-2xl border px-3 py-3 transition ${
        active
          ? 'border-white/15 bg-white/10 text-white'
          : 'border-transparent text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-gray-200'
      }`}
    >
      <div className={`mt-0.5 rounded-lg p-2 ${active ? 'bg-white/10' : 'bg-white/5'}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {count && count > 0 ? (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
          {badge ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              {badge}
            </span>
          ) : null}
        </div>
        {helper ? <p className="mt-1 text-xs leading-5 text-gray-500">{helper}</p> : null}
      </div>
    </Link>
  );
}
