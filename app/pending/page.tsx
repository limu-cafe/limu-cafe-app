'use client';

import { useUserLocale } from '@/components/user/UserLocaleProvider';

export default function PendingPage() {
  const { locale } = useUserLocale();
  const copy =
    locale === 'en'
      ? {
          title: 'Approval pending',
          description: 'Please wait until an admin approves your account.',
          detail: 'We will let you know on Slack once your account is approved.',
        }
      : {
          title: '承認待ちです',
          description: '管理者がアカウントを承認するまでお待ちください。',
          detail: '承認されたらSlackでお知らせします。',
        };

  return (
    <div className="min-h-screen texture-bg flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="font-display font-bold text-2xl text-espresso mb-2">
          {copy.title}
        </h1>
        <p className="text-espresso-400 text-sm leading-relaxed">
          {copy.description}<br />
          {copy.detail}
        </p>
      </div>
    </div>
  );
}
