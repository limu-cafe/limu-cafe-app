'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, User, Coffee, ClipboardList, LogOut, Shield, Languages } from 'lucide-react';
import { useCartStore } from '@/lib/store/cart';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

type NavbarUser = {
  id: string;
  name: string;
  balance: number;
};

export default function Navbar({ initialUser = null }: { initialUser?: NavbarUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, toggleLocale } = useUserLocale();
  const cartCount = useCartStore((s) => s.count());
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [user, setUser] = useState<NavbarUser | null>(initialUser);
  const copy =
    locale === 'en'
      ? {
          appSubtitle: 'Lab purchase app',
          balance: 'Balance',
          login: 'Login',
          logout: 'Logout',
          admin: 'Admin',
          cart: 'Cart',
          localeLabel: '日本語',
          mobileLocaleLabel: 'JA',
          nav: {
            home: 'Products',
            mypage: 'My Page',
            request: 'Requests',
          },
        }
      : {
          appSubtitle: '研究室向け購買アプリ',
          balance: '残高',
          login: 'ログイン',
          logout: 'ログアウト',
          admin: '管理者',
          cart: 'カート',
          localeLabel: 'English',
          mobileLocaleLabel: 'EN',
          nav: {
            home: '商品一覧',
            mypage: 'マイページ',
            request: '要望',
          },
        };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cachedUser = sessionStorage.getItem('limu-navbar-user');
      if (cachedUser) {
        try {
          setUser(JSON.parse(cachedUser));
        } catch {
          sessionStorage.removeItem('limu-navbar-user');
        }
      }
    }

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, name, balance')
          .eq('id', data.user.id)
          .single();
        const fallbackUser = {
          id: data.user.id,
          name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? data.user.email ?? 'LIMU Member',
          balance: 0,
        };
        const navbarUser = profile ?? fallbackUser;
        setUser(navbarUser);
        sessionStorage.setItem('limu-navbar-user', JSON.stringify(navbarUser));
      } else {
        setUser(null);
        sessionStorage.removeItem('limu-navbar-user');
      }
    });
  }, [initialUser]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('limu-navbar-user');
    router.push('/login');
  };

  const navItems = [
    { href: '/', label: copy.nav.home, icon: Coffee },
    { href: '/mypage', label: copy.nav.mypage, icon: User },
    { href: '/request', label: copy.nav.request, icon: ClipboardList },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-cream-200 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:hidden">
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-espresso text-lg text-cream-50">
            ☕
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-espresso">
              LIMU<span className="text-matcha">喫茶</span>
            </p>
            <p className="text-[10px] font-medium tracking-[0.12em] text-espresso-400">
              {copy.appSubtitle}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLocale}
            className="rounded-2xl border border-cream-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-espresso-500 transition-all duration-200 hover:bg-cream-50 hover:text-espresso"
            aria-label={copy.localeLabel}
          >
            {copy.mobileLocaleLabel}
          </button>
          {user && (
            <Link
              href="/charge"
              className="flex flex-col items-end rounded-xl border border-cream-200 bg-white px-3 py-2 transition-all duration-200 hover:bg-cream-50"
            >
              <span className="text-[10px] tracking-[0.12em] text-espresso-400">{copy.balance}</span>
              <span className="font-mono text-xs font-semibold text-espresso">
                ¥{user.balance.toLocaleString()}
              </span>
            </Link>
          )}

          {user ? (
            <button
              onClick={handleLogout}
              className="rounded-2xl border border-cream-200 bg-white p-2.5 text-espresso-400 transition-all duration-200 hover:bg-cream-50 hover:text-espresso"
              title={copy.logout}
            >
              <LogOut size={18} />
            </button>
          ) : (
            <Link href="/login" className="btn-primary px-3 py-2 text-xs">
              {copy.login}
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto hidden h-20 max-w-6xl items-center justify-between gap-4 px-4 md:flex">
        {/* ロゴ */}
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-espresso text-xl text-cream-50">
            ☕
          </div>
          <div className="min-w-0">
            <p className="font-display text-xl font-bold text-espresso transition-colors group-hover:text-espresso-600">
              LIMU<span className="text-matcha">喫茶</span>
            </p>
            <p className="text-[11px] font-medium tracking-[0.16em] text-espresso-400">
              {copy.appSubtitle}
            </p>
          </div>
        </Link>

        {/* ナビゲーション */}
        <div className="hidden items-center gap-1 rounded-full border border-cream-200 bg-white p-1 md:flex">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                pathname === href
                  ? 'bg-espresso text-cream-50'
                  : 'text-espresso-600 hover:bg-cream-100'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </div>

        {/* 右側アクション */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLocale}
            className="hidden items-center gap-1.5 rounded-full border border-cream-200 bg-white px-3 py-2 text-sm font-medium text-espresso-500 transition-all duration-200 hover:bg-cream-50 hover:text-espresso sm:flex"
          >
            <Languages size={16} />
            {copy.localeLabel}
          </button>
          <Link
            href="/admin/password"
            className="hidden items-center gap-1.5 rounded-full border border-cream-200 bg-white px-3 py-2 text-sm font-medium text-espresso-500 transition-all duration-200 hover:bg-cream-50 hover:text-espresso sm:flex"
          >
            <Shield size={16} />
            {copy.admin}
          </Link>

          {/* 残高表示 */}
          {user && (
            <Link
              href="/charge"
              className="hidden rounded-xl border border-cream-200 bg-white px-4 py-2 transition-all duration-200 hover:bg-cream-50 sm:flex sm:flex-col sm:items-end sm:gap-0"
            >
              <span className="text-[11px] tracking-[0.16em] text-espresso-400">{copy.balance}</span>
              <span className="font-mono text-sm font-semibold text-espresso">
                ¥{user.balance.toLocaleString()}
              </span>
            </Link>
          )}

          {/* カート */}
          <Link
            href="/cart"
            className="relative rounded-2xl border border-cream-200 bg-white p-2.5 transition-all duration-200 hover:bg-cream-50"
          >
            <ShoppingCart size={22} className="text-espresso" />
            {hasHydrated && cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-matcha text-xs font-bold text-white animate-scale-in">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Link>

          {/* ユーザーメニュー */}
          {user ? (
            <button
              onClick={handleLogout}
              className="rounded-2xl border border-cream-200 bg-white p-2.5 text-espresso-400 transition-all duration-200 hover:bg-cream-50 hover:text-espresso"
              title={copy.logout}
            >
              <LogOut size={20} />
            </button>
          ) : (
            <Link href="/login" className="btn-primary px-4 py-2 text-sm">
              {copy.login}
            </Link>
          )}
        </div>
      </div>

      {/* モバイルボトムナビ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-cream-200 bg-white/95 backdrop-blur-xl md:hidden">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              pathname === href ? 'text-espresso' : 'text-espresso-400'
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
        <Link
          href="/cart"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors relative ${
            pathname === '/cart' ? 'text-espresso' : 'text-espresso-400'
          }`}
        >
          <ShoppingCart size={20} />
          {copy.cart}
          {hasHydrated && cartCount > 0 && (
            <span className="absolute top-1 left-1/2 translate-x-1 w-4 h-4 bg-matcha text-white text-xs font-bold rounded-full flex items-center justify-center">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </Link>
        <Link
          href="/admin/password"
          className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-espresso-400 transition-colors"
        >
          <Shield size={20} />
          {copy.admin}
        </Link>
      </div>
    </nav>
  );
}
