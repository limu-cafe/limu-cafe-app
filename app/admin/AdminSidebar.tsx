'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, LogOut } from 'lucide-react';
import { clearAdminSession } from './AdminAuthGuard';

import { ADMIN_NAVIGATION, type SidebarNotifications } from '@/lib/admin-navigation';

export default function AdminSidebar({ notifications = {}, status = 'ready' }: {
  notifications?: Partial<SidebarNotifications>;
  status?: 'ready' | 'loading' | 'error';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sections = ADMIN_NAVIGATION;

  const handleLogout = async () => {
    try {
      await clearAdminSession();
      router.push('/admin/login');
    } catch {
      toast.error('ログアウトに失敗しました。もう一度お試しください');
    }
  };

  return (
    <aside className="h-full max-h-[100dvh] w-72 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-950">
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

      {status !== 'ready' && <p role="status" className="px-5 py-2 text-xs text-gray-400">{status === 'loading' ? '件数を読み込み中…' : '件数を取得できませんでした'}</p>}
      <nav className="space-y-6 px-4 py-5">
        {sections.map((section) => (
          <section key={section.label} className="space-y-2">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = [item.href, ...(item.activePaths ?? [])].some((href) =>
                  pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))
                );
                const Icon = item.icon;
                const count = item.notificationKey ? notifications[item.notificationKey] ?? 0 : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    aria-current={active ? 'page' : undefined}
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
                    {count > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          active ? 'bg-gray-950/10 text-gray-950' : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {count}
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
