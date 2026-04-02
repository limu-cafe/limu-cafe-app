'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { setAdminSession } from '../AdminAuthGuard';
import { createClient } from '@/lib/supabase/client';

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const next = searchParams.get('next');
  const nextPath = next && next.startsWith('/admin') ? next : '/admin';

  const handleSlackLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const callbackUrl = new URL('/api/auth/callback', window.location.origin);
    callbackUrl.searchParams.set('next', nextPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'slack_oidc',
      options: {
        redirectTo: callbackUrl.toString(),
        scopes: 'openid profile email',
      },
    });

    if (error) {
      toast.error('Slackログインに失敗しました');
      setLoading(false);
    }
  };

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
        toast.success('ログインしました');
        router.push(nextPath);
      } else {
        const error = await res.json().catch(() => null);
        toast.error(
          error?.error === 'Slack login required'
            ? '先にSlackでログインしてください'
            : 'パスワードが違います'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">☕</div>
          <h1 className="font-display font-bold text-2xl text-white">
            LIMU喫茶 管理者
          </h1>
          <p className="text-gray-400 text-sm mt-1">Slack認証後に管理者パスワードを入力してください</p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
          <button
            onClick={handleSlackLogin}
            disabled={loading}
            className="w-full rounded-lg border border-gray-700 bg-[#4A154B] px-4 py-3 text-sm font-medium text-white hover:bg-[#3a0f3b] transition-colors disabled:opacity-60"
          >
            Slackでログイン
          </button>

          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="password"
              placeholder="パスワード"
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
              'ログイン'
            )}
          </button>
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
