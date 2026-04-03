'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, User, Coffee, ClipboardList, LogOut, Shield } from 'lucide-react';
import { useCartStore } from '@/lib/store/cart';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { User as UserType } from '@/types';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.count());
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single();
        setUser(profile);
      }
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const navItems = [
    { href: '/', label: '商品一覧', icon: Coffee },
    { href: '/mypage', label: 'マイページ', icon: User },
    { href: '/request', label: '要望', icon: ClipboardList },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-cream-200 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4">
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
              研究室向け購買アプリ
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
          <Link
            href="/admin/password"
            className="hidden items-center gap-1.5 rounded-full border border-cream-200 bg-white px-3 py-2 text-sm font-medium text-espresso-500 transition-all duration-200 hover:bg-cream-50 hover:text-espresso sm:flex"
          >
            <Shield size={16} />
            管理者
          </Link>

          {/* 残高表示 */}
          {user && (
            <Link
              href="/charge"
              className="hidden rounded-xl border border-cream-200 bg-white px-4 py-2 transition-all duration-200 hover:bg-cream-50 sm:flex sm:flex-col sm:items-end sm:gap-0"
            >
              <span className="text-[11px] tracking-[0.16em] text-espresso-400">残高</span>
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
              title="ログアウト"
            >
              <LogOut size={20} />
            </button>
          ) : (
            <Link href="/login" className="btn-primary px-4 py-2 text-sm">
              ログイン
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
          カート
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
          管理者
        </Link>
      </div>
    </nav>
  );
}
