'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { setAdminSession } from '../AdminAuthGuard';
import { createClient } from '@/lib/supabase/client';

function AdminPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const next = searchParams.get('next');
  const nextPath = useMemo(
    () => (next && next.startsWith('/admin') ? next : '/admin'),
    [next]
  );

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace(`/admin/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      setCheckingSession(false);
    };

    checkSession();
  }, [nextPath, router]);

  const handleLogin = async () => {
    if (!password) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setAdminSession();
        toast.success('管理者画面に移動します');
        router.push(nextPath);
        return;
      }

      const error = await res.json().catch(() => null);
      toast.error(
        error?.error === 'Slack login required'
          ? '先にSlack認証を行ってください'
          : 'パスワードが違います'
      );
    } finally {
      setLoading(false);
    }
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
            管理者パスワード
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Slack認証のあと、この画面で管理者パスワードを入力してください
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="password"
              placeholder="管理者パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20 placeholder:text-gray-600"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || !password}
            className="w-full bg-white text-gray-950 py-3 rounded-lg font-medium hover:bg-gray-100 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
            ) : (
              '管理者画面へ進む'
            )}
          </button>

          <Link
            href="/admin/login"
            className="block text-center text-sm text-gray-400 transition-colors hover:text-white"
          >
            Slack認証からやり直す
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <AdminPasswordContent />
    </Suspense>
  );
}
