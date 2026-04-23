'use client';

import RequestForm from './RequestForm';
import RequestBoardClient from './RequestBoardClient';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

type RequestUser = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type RequestListRow = {
  id: string;
  user_id: string;
  item_name: string;
  reason?: string | null;
  desired_price?: number | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
  user?: RequestUser;
  vote_count: number;
  has_voted: boolean;
};

export default function RequestPageContent({ requests }: { requests: RequestListRow[] }) {
  const { locale } = useUserLocale();
  const copy =
    locale === 'en'
      ? {
          title: 'Product requests',
          subtitle: 'Share what you want to buy and gather support or comments.',
          requestCount: 'Requests',
          pendingCount: 'Open',
          boardTitle: 'Community requests',
          boardSubtitle:
            'The list shows only the essentials. Open the detail page for full reasons and comments.',
          guideTitle: 'How it works',
          guideLines: [
            'Post a product name and short reason.',
            'Support existing requests or add comments.',
            'Approved requests are shared with admins as purchase candidates.',
          ],
        }
      : {
          title: '商品の要望',
          subtitle: '欲しい商品を共有して、賛成やコメントを集められます。',
          requestCount: '要望',
          pendingCount: '検討中',
          boardTitle: 'みんなの要望',
          boardSubtitle:
            '一覧では要点だけを表示しています。詳しい内容やコメントは詳細ページで確認できます。',
          guideTitle: '使い方',
          guideLines: [
            '商品名と理由を書いて要望を投稿できます。',
            '他の要望に賛成したり、コメントで意見を追加できます。',
            '採用された要望は購入候補として管理者に共有されます。',
          ],
        };

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-espresso">{copy.title}</h1>
          <p className="mt-1 text-sm text-espresso-400">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-espresso-500">
          <span className="rounded-full bg-white px-3 py-2 ring-1 ring-cream-200">
            {copy.requestCount} {requests.length}
          </span>
          <span className="rounded-full bg-white px-3 py-2 ring-1 ring-cream-200">
            {copy.pendingCount} {requests.filter((request) => request.status === 'pending').length}
          </span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <RequestForm />

          <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
            <h2 className="text-sm font-semibold text-espresso">{copy.guideTitle}</h2>
            <div className="mt-3 space-y-2 text-sm leading-6 text-espresso-500">
              {copy.guideLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
            <h2 className="font-medium text-espresso">{copy.boardTitle}</h2>
            <p className="mt-1 text-sm text-espresso-400">{copy.boardSubtitle}</p>
          </div>
          <RequestBoardClient requests={requests} />
        </section>
      </div>
    </div>
  );
}
