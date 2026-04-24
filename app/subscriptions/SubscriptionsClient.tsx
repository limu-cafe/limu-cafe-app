'use client';

import Link from 'next/link';
import { CalendarClock, Coins, Repeat2, Wallet } from 'lucide-react';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import {
  formatSubscriptionInterval,
  getSubscriptionDisplayName,
  storageDateToMonthValue,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/lib/subscriptions';
import type { SubscriptionProduct, UserSubscription } from '@/types';

export default function SubscriptionsClient({
  cards,
}: {
  cards: Array<{
    product: SubscriptionProduct;
    latestSubscription: UserSubscription | null;
  }>;
}) {
  const { locale } = useUserLocale();
  const copy =
    locale === 'en'
      ? {
          title: 'Subscriptions',
          subtitle: 'Manage coffee, tea, snack, and other recurring plans separately from normal products.',
          inactive: 'Not subscribed',
          active: 'Active',
          expiresAt: 'Valid until',
          nextBilling: 'Next billing',
          endMonth: 'Planned end month',
          points: 'Points OK',
          balance: 'Balance OK',
          open: 'Open',
        }
      : {
          title: 'サブスク',
          subtitle: 'コーヒーやお茶、お菓子などの定期契約を商品購入とは別で管理できます。',
          inactive: '未契約',
          active: '契約中',
          expiresAt: '有効期限',
          nextBilling: '次回支払',
          endMonth: '終了予定年月',
          points: 'ポイント利用可',
          balance: '残高利用可',
          open: '詳細を見る',
        };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-cream-100 px-3 py-1 text-xs font-semibold text-espresso-500">
          <Repeat2 size={14} />
          Subscription
        </div>
        <h1 className="font-display text-3xl font-bold text-espresso">{copy.title}</h1>
        <p className="text-sm text-espresso-400">{copy.subtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ product, latestSubscription }) => {
          const statusLabel = latestSubscription
            ? SUBSCRIPTION_STATUS_LABELS[latestSubscription.status]
            : copy.inactive;

          return (
            <div key={product.id} className="card flex h-full flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold text-espresso">
                      {getSubscriptionDisplayName(product, locale)}
                    </h2>
                    <p className="mt-1 text-sm text-espresso-400">
                      {formatSubscriptionInterval(
                        product.billing_interval_count,
                        product.billing_interval_unit,
                        locale
                      )}
                    </p>
                  </div>
                  <span className="rounded-full bg-cream-100 px-2.5 py-1 text-xs font-medium text-espresso-600">
                    {statusLabel}
                  </span>
                </div>

                {product.description ? (
                  <p className="text-sm leading-6 text-espresso-500">{product.description}</p>
                ) : null}

                <p className="font-display text-3xl font-bold text-espresso">
                  ¥{product.price.toLocaleString()}
                </p>

                <div className="flex flex-wrap gap-2 text-xs">
                  {product.points_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-matcha/10 px-2.5 py-1 text-matcha-dark">
                      <Coins size={12} />
                      {copy.points}
                    </span>
                  )}
                  {product.balance_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                      <Wallet size={12} />
                      {copy.balance}
                    </span>
                  )}
                </div>

                {latestSubscription ? (
                  <div className="space-y-1 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm text-espresso-500">
                    <div className="flex items-center justify-between gap-3">
                      <span>{copy.expiresAt}</span>
                      <span className="font-medium text-espresso">
                        {latestSubscription.current_period_end_at
                          ? latestSubscription.current_period_end_at.slice(0, 10)
                          : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{copy.nextBilling}</span>
                      <span className="font-medium text-espresso">
                        {latestSubscription.next_billing_at
                          ? latestSubscription.next_billing_at.slice(0, 10)
                          : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{copy.endMonth}</span>
                      <span className="font-medium text-espresso">
                        {storageDateToMonthValue(latestSubscription.end_month)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <Link href={`/subscriptions/${product.id}`} className="btn-primary w-full text-center">
                {copy.open}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
