'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, User, Coffee, ClipboardList, LogOut } from 'lucide-react';
import { useCartStore } from '@/lib/store/cart';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { User as UserType } from '@/types';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.count());
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
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-cream-200">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* ロゴ */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-2xl">☕</span>
          <span className="font-display font-bold text-xl text-espresso group-hover:text-espresso-600 transition-colors">
            LIMU<span className="text-matcha">喫茶</span>
          </span>
        </Link>

        {/* ナビゲーション */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
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
          {/* 残高表示 */}
          {user && (
            <div className="hidden sm:flex items-center gap-1 bg-cream-100 px-3 py-1.5 rounded-full text-sm">
              <span className="text-espresso-400 text-xs">残高</span>
              <span className="font-medium text-espresso font-mono">
                ¥{user.balance.toLocaleString()}
              </span>
            </div>
          )}

          {/* カート */}
          <Link
            href="/cart"
            className="relative p-2 rounded-lg hover:bg-cream-100 transition-colors"
          >
            <ShoppingCart size={22} className="text-espresso" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-matcha text-white text-xs font-bold rounded-full flex items-center justify-center animate-scale-in">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Link>

          {/* ユーザーメニュー */}
          {user ? (
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-cream-100 transition-colors text-espresso-400 hover:text-espresso"
              title="ログアウト"
            >
              <LogOut size={20} />
            </button>
          ) : (
            <Link href="/login" className="btn-primary text-sm py-2 px-4">
              ログイン
            </Link>
          )}
        </div>
      </div>

      {/* モバイルボトムナビ */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-cream-200 flex z-50">
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
          {cartCount > 0 && (
            <span className="absolute top-1 left-1/2 translate-x-1 w-4 h-4 bg-matcha text-white text-xs font-bold rounded-full flex items-center justify-center">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </Link>
      </div>
    </nav>
  );
}
