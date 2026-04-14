'use client';

import { createClient } from '@/lib/supabase/client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { UserLocaleProvider, useUserLocale } from '@/components/user/UserLocaleProvider';

function LoginContent() {
  const router = useRouter();
  const { locale, toggleLocale } = useUserLocale();
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const next = searchParams.get('next');
  const detectedWorkspaceId = searchParams.get('detected_workspace_id');

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const nextPath = next && next.startsWith('/') ? next : '/';
        router.replace(nextPath);
        return;
      }
      setCheckingSession(false);
    });
  }, [next, router]);

  const isWorkspaceMismatch = error === 'workspace_not_allowed';

  const errorMessage =
    isWorkspaceMismatch
      ? locale === 'en'
        ? 'You are currently signed in to a different Slack workspace.'
        : '現在、別の Slack ワークスペースでログインされています。'
      : error === 'auth_failed'
      ? locale === 'en'
        ? 'Authentication failed. Please try again.'
        : 'ログイン処理に失敗しました。もう一度お試しください。'
      : error === 'oauth_failed'
      ? locale === 'en'
        ? 'Failed to start Slack sign-in. Please check the configuration.'
        : 'Slackログインの開始に失敗しました。設定を確認してください。'
      : error === 'no_code'
      ? locale === 'en'
        ? 'No authorization code was returned. Please sign in again.'
        : '認証コードを取得できませんでした。もう一度ログインしてください。'
      : null;

  const workspaceHint =
    isWorkspaceMismatch
      ? locale === 'en'
        ? 'Please switch to the LIMU workspace in Slack and try again. If Slack keeps opening another workspace first, using a private/incognito window usually helps.'
        : 'Slack 側で LIMU のワークスペースに切り替えてから、もう一度ログインしてください。別のワークスペースが先に開いてしまう場合は、シークレットウィンドウを使うと入りやすいです。'
      : null;

  if (checkingSession) {
    return <div className="min-h-screen texture-bg" />;
  }

  const handleSlackLogin = async () => {
    setLoading(true);
    const loginUrl = new URL('/api/auth/login', window.location.origin);
    if (next?.startsWith('/')) {
      loginUrl.searchParams.set('next', next);
    }
    window.location.href = loginUrl.toString();
  };

  return (
    <div className="min-h-screen texture-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={toggleLocale}
              className="rounded-full border border-cream-200 bg-white px-3 py-1.5 text-xs font-medium text-espresso-500 transition-colors hover:bg-cream-50 hover:text-espresso"
            >
              {locale === 'en' ? '日本語' : 'English'}
            </button>
          </div>
          <div className="text-6xl mb-4">☕</div>
          <h1 className="font-display font-bold text-4xl text-espresso">
            LIMU<span className="text-matcha">喫茶</span>
          </h1>
          <p className="text-espresso-400 mt-2">
            {locale === 'en' ? 'Lab purchase app' : '研究室のオンライン購買'}
          </p>
        </div>
        <div className="card space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-medium text-espresso">
              {locale === 'en' ? 'Sign in with LIMU Slack' : '研究室のSlackでログイン'}
            </h2>
            <p className="text-sm text-espresso-400">
              {locale === 'en'
                ? 'Members of the LIMU Slack workspace can use the app right away.'
                : 'LIMUのSlackワークスペースのメンバーはすぐに利用できます'}
            </p>
          </div>
          {errorMessage && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                isWorkspaceMismatch
                  ? 'border border-amber-200 bg-amber-50 text-amber-800'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <div className="font-medium">
                {isWorkspaceMismatch
                  ? locale === 'en'
                    ? 'Signed in to another workspace'
                    : '別のワークスペースでログイン中です'
                  : errorMessage}
              </div>
              {isWorkspaceMismatch ? <div className="mt-1">{errorMessage}</div> : null}
              {detectedWorkspaceId && (
                <div
                  className={`mt-2 font-mono text-xs ${
                    isWorkspaceMismatch ? 'text-amber-700' : 'text-red-600'
                  }`}
                >
                  {locale === 'en' ? 'Detected workspace ID' : '検出された workspace ID'}: {detectedWorkspaceId}
                </div>
              )}
              {workspaceHint && <div className="mt-2">{workspaceHint}</div>}
            </div>
          )}
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
                {locale === 'en' ? 'Continue with Slack' : 'Slackでログイン'}
              </>
            )}
          </button>
          <div className="border-t border-cream-200 pt-4 text-center text-sm">
            <a href="/admin/login" className="text-espresso-500 hover:text-espresso-700 transition-colors">
              {locale === 'en' ? 'Admin sign-in' : '管理者ログインはこちら'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <UserLocaleProvider>
      <Suspense fallback={<div className="min-h-screen texture-bg" />}>
        <LoginContent />
      </Suspense>
    </UserLocaleProvider>
  );
}
