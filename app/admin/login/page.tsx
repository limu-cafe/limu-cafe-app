'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const next = searchParams.get('next');
  const nextPath = next && next.startsWith('/admin') ? next : '/admin';
  const passwordPath = `/admin/password?next=${encodeURIComponent(nextPath)}`;

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        router.replace(passwordPath);
        return;
      }
      setCheckingSession(false);
    };

    checkSession();
  }, [passwordPath, router]);

  const handleSlackLogin = async () => {
    setLoading(true);
    const loginUrl = new URL('/api/auth/login', window.location.origin);
    loginUrl.searchParams.set('next', passwordPath);
    window.location.href = loginUrl.toString();
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">☕</div>
          <h1 className="font-display font-bold text-2xl text-white">
            LIMU喫茶 管理者
          </h1>
          <p className="text-gray-400 text-sm mt-1">研究室のSlack認証を通したあと、専用画面でパスワードを入力します</p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
          <button
            onClick={handleSlackLogin}
            disabled={loading}
            className="w-full rounded-lg border border-gray-700 bg-[#4A154B] px-4 py-3 text-sm font-medium text-white hover:bg-[#3a0f3b] transition-colors disabled:opacity-60"
          >
            Slackでログイン
          </button>

          <Link
            href={passwordPath}
            className="block w-full rounded-lg border border-gray-700 px-4 py-3 text-center text-sm font-medium text-gray-200 transition-colors hover:bg-gray-800"
          >
            すでにSlack認証済みの方はこちら
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <AdminLoginContent />
    </Suspense>
  );
}
