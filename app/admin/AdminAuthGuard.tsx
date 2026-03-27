'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const SESSION_KEY = 'limu_admin_auth';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8時間

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // ログインページは除外
    if (pathname === '/admin/login') {
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

  if (!authed && pathname !== '/admin/login') return null;

  return <>{children}</>;
}

// 外部から呼び出すユーティリティ
export function setAdminSession() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ expiry: Date.now() + SESSION_DURATION })
  );
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
