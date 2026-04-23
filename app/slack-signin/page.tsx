'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserLocaleProvider, useUserLocale } from '@/components/user/UserLocaleProvider';

function SlackSigninGuideContent() {
  const searchParams = useSearchParams();
  const { locale, toggleLocale } = useUserLocale();
  const next = searchParams.get('next');
  const nextPath = next && next.startsWith('/') ? next : '/';
  const isAdminFlow = nextPath.startsWith('/admin');
  const continueHref = `/api/auth/login?next=${encodeURIComponent(nextPath)}`;
  const backHref = isAdminFlow ? '/admin/login' : '/login';

  const copy =
    locale === 'en'
      ? {
          title: 'Sign in to Slack on the web first',
          subtitle:
            'If Slack is currently signed in to another workspace, the sign-in flow may stop with a Slack error page.',
          stepOneTitle: '1. Open Slack in your browser',
          stepOneBody:
            'Sign in to the correct LIMU workspace in a separate tab. This page will stay open.',
          webSlack: 'Open Slack sign-in',
          stepTwoTitle: '2. Return here and continue',
          stepTwoBody:
            'After signing in to the correct workspace on web Slack, continue the app sign-in flow.',
          continue: 'Continue with Slack',
          back: isAdminFlow ? 'Back to admin sign-in' : 'Back to sign-in',
          hint:
            'If Slack still opens the wrong workspace, switch workspace in Slack Web first and then try again.',
        }
      : {
          title: '先にWeb版Slackへサインインしてください',
          subtitle:
            'Slack が別のワークスペースに入ったままだと、このアプリのログイン中に Slack のエラー画面で止まることがあります。',
          stepOneTitle: '1. Slackのワークスペース選択画面を開く',
          stepOneBody:
            '別タブで Slack を開き、一覧に LIMU のワークスペースがあればそこへ入ってください。このページは開いたまま使えます。',
          webSlack: 'Slackのワークスペースを開く',
          stepTwoTitle: '2. このページに戻って続ける',
          stepTwoBody:
            '正しいワークスペースに入れたら、このアプリの Slack ログインを続けます。',
          continue: 'Slackログインを続ける',
          back: isAdminFlow ? '管理者ログインに戻る' : 'ログイン画面に戻る',
          hint:
            '先に Slack Web で LIMU のワークスペースへ入っておくと、認証が通りやすくなります。',
        };

  return (
    <div className="min-h-screen texture-bg flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={toggleLocale}
              className="rounded-full border border-cream-200 bg-white px-3 py-1.5 text-xs font-medium text-espresso-500 transition-colors hover:bg-cream-50 hover:text-espresso"
            >
              {locale === 'en' ? '日本語' : 'English'}
            </button>
          </div>
          <div className="text-5xl mb-4">☕</div>
          <h1 className="font-display font-bold text-3xl text-espresso">
            LIMU<span className="text-matcha">喫茶</span>
          </h1>
          <p className="text-espresso-400 mt-3">{copy.subtitle}</p>
        </div>

        <div className="card space-y-6">
          <div className="space-y-2">
            <h2 className="font-medium text-lg text-espresso">{copy.title}</h2>
            <p className="text-sm text-espresso-400">{copy.hint}</p>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-white/80 p-4 space-y-3">
            <div>
              <div className="font-medium text-espresso">{copy.stepOneTitle}</div>
              <p className="mt-1 text-sm text-espresso-400">{copy.stepOneBody}</p>
            </div>
            <a
              href="https://slack.com/signin"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-cream-200 bg-white px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50"
            >
              {copy.webSlack}
            </a>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-white/80 p-4 space-y-3">
            <div>
              <div className="font-medium text-espresso">{copy.stepTwoTitle}</div>
              <p className="mt-1 text-sm text-espresso-400">{copy.stepTwoBody}</p>
            </div>
            <Link
              href={continueHref}
              className="inline-flex items-center justify-center rounded-xl bg-[#4A154B] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3a0f3b]"
            >
              {copy.continue}
            </Link>
          </div>

          <div className="border-t border-cream-200 pt-4 text-center text-sm">
            <Link href={backHref} className="text-espresso-500 hover:text-espresso transition-colors">
              {copy.back}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SlackSigninGuidePage() {
  return (
    <UserLocaleProvider>
      <Suspense fallback={<div className="min-h-screen texture-bg" />}>
        <SlackSigninGuideContent />
      </Suspense>
    </UserLocaleProvider>
  );
}
