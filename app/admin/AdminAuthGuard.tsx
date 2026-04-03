'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const SESSION_KEY = 'limu_admin_auth';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8時間
const COOKIE_MAX_AGE = 8 * 60 * 60;
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/password']);

function getCookieExpiry() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )limu_admin_auth=([^;]+)/);
  return match?.[1] ? Number(decodeURIComponent(match[1])) : null;
}

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // ログイン前に開ける画面は除外
    if (PUBLIC_ADMIN_PATHS.has(pathname)) {
      setChecked(true);
      setAuthed(true);
      return;
    }

    // セッション確認
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const { expiry } = JSON.parse(raw);
        if (Date.now() < expiry) {
          setAuthed(true);
          setChecked(true);
          return;
        }
      }

      const cookieExpiry = getCookieExpiry();
      if (cookieExpiry && Date.now() < cookieExpiry) {
        setAuthed(true);
        setChecked(true);
        return;
      }
    } catch {}

    router.replace('/admin/login');
    setChecked(true);
  }, [pathname, router]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authed && !PUBLIC_ADMIN_PATHS.has(pathname)) return null;

  return <>{children}</>;
}

// 外部から呼び出すユーティリティ
export function setAdminSession() {
  const expiry = Date.now() + SESSION_DURATION;
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ expiry })
  );
  document.cookie = `${SESSION_KEY}=${expiry}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
  document.cookie = `${SESSION_KEY}=; path=/; max-age=0; samesite=lax`;
}
