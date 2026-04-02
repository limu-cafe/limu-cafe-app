'use client';

import { createClient } from '@/lib/supabase/client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const handleSlackLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const next = searchParams.get('next');
    const callbackUrl = new URL('/api/auth/callback', window.location.origin);
    if (next?.startsWith('/')) {
      callbackUrl.searchParams.set('next', next);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'slack_oidc',
      options: {
        redirectTo: callbackUrl.toString(),
        scopes: 'openid profile email',
      },
    });
    if (error) {
      toast.error('ログインに失敗しました: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen texture-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">☕</div>
          <h1 className="font-display font-bold text-4xl text-espresso">
            LIMU<span className="text-matcha">喫茶</span>
          </h1>
          <p className="text-espresso-400 mt-2">研究室のオンライン購買</p>
        </div>
        <div className="card space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-medium text-espresso">研究室のSlackでログイン</h2>
            <p className="text-sm text-espresso-400">
              LIMUのSlackワークスペースのメンバーはすぐに利用できます
            </p>
          </div>
          <button
            onClick={handleSlackLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-[#4A154B] hover:bg-[#3a0f3b] text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 active:scale-95 disabled:opacity-60"
          >
            {loading ? (
              <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 54 54" fill="none">
                  <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" fill="#36C5F0"/>
                  <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" fill="#2EB67D"/>
                  <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" fill="#ECB22E"/>
                  <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.249m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.25a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387" fill="#E01E5A"/>
                </svg>
                Slackでログイン
              </>
            )}
          </button>
          <div className="border-t border-cream-200 pt-4 text-center text-sm">
            <a href="/admin/login" className="text-espresso-500 hover:text-espresso-700 transition-colors">
              管理者ログインはこちら
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen texture-bg" />}>
      <LoginContent />
    </Suspense>
  );
}
