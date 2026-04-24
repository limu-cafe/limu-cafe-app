'use client';

import { useState } from 'react';
import { Wallet, Clock, ChevronDown, ChevronRight, Coins } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import LegacyTransferRequestCard from './LegacyTransferRequestCard';
import type {
  LegacyTransferRequest,
  PointTransaction,
  User,
} from '@/types';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import { getItemDisplayName } from '@/lib/item-display';
import { POINT_REASON_LABELS } from '@/lib/points';

type FavoriteCard = {
  item: {
    id: string;
    name: string;
    english_name?: string | null;
    price: number;
    stock: number;
    is_available: boolean;
  };
};

type UnifiedPaymentEntry = {
  id: string;
  kind: 'order' | 'charge' | 'settlement' | 'subscription';
  created_at: string;
  amount: number;
  status: string;
  payment_method: string;
  title: string;
  detail: string;
  points_used?: number;
  balance_used?: number;
  cash_due_amount?: number;
};

const PAGE_SIZE = 5;

type HistorySection = 'payments' | 'points';

export default function MyPageClient({
  profile,
  favorites,
  latestLegacyTransferRequest,
}: {
  profile: Pick<User, 'name' | 'email' | 'avatar_url' | 'balance' | 'deferred_balance' | 'points_balance'> | null;
  favorites: FavoriteCard[];
  latestLegacyTransferRequest: LegacyTransferRequest | null;
}) {
  const { locale } = useUserLocale();
  const dateLocale = locale === 'en' ? enUS : ja;
  const [payments, setPayments] = useState<UnifiedPaymentEntry[]>([]);
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([]);
  const [hasMorePayments, setHasMorePayments] = useState(false);
  const [hasMorePoints, setHasMorePoints] = useState(false);
  const [loadedSections, setLoadedSections] = useState<Record<HistorySection, boolean>>({
    payments: false,
    points: false,
  });
  const [openSections, setOpenSections] = useState<Record<HistorySection, boolean>>({
    payments: false,
    points: false,
  });
  const [loadingSections, setLoadingSections] = useState<Record<HistorySection, boolean>>({
    payments: false,
    points: false,
  });

  const copy =
    locale === 'en'
      ? {
          paymentMethodLabel: {
            balance: 'Balance',
            deferred: 'Pay later',
            cash: 'Cash',
            stripe: 'Card',
          } as Record<string, string>,
          subscriptionPaymentMethodLabel: {
            points: 'Points',
            balance: 'Balance',
            cash: 'Cash',
            mixed: 'Mixed',
          } as Record<string, string>,
          statusLabel: {
            pending: 'Pending',
            completed: 'Completed',
            cancelled: 'Cancelled',
            refunded: 'Refunded',
          } as Record<string, string>,
          chargeStatusLabel: {
            approved: 'Applied',
            pending: 'Pending',
            rejected: 'Rejected',
            refunded: 'Refunded',
            cancelled: 'Cancelled',
          } as Record<string, string>,
          settlementStatusLabel: {
            pending: 'Pending',
            completed: 'Completed',
          } as Record<string, string>,
          subscriptionStatusLabel: {
            pending_cash_settlement: 'Awaiting cash settlement',
            completed: 'Applied',
            cancelled: 'Cancelled',
          } as Record<string, string>,
          fallbackName: 'LIMU Member',
          balance: 'Balance',
          topUp: 'Top up',
          deferredBalance: 'Deferred balance',
          deferredNote: 'Paid on the settlement schedule',
          points: 'Points',
          pointsNote: '1pt = ¥1 when ordering',
          paymentHistory: 'Payment history',
          pointHistory: 'Point history',
          favorites: 'Favorites',
          subscriptions: 'Subscriptions',
          backToProducts: 'Back to products',
          available: 'Available now',
          unavailable: 'Unavailable now',
          load: 'Show',
          hide: 'Hide',
          collapsedHint: 'Loaded only when you open this section.',
          loading: 'Loading...',
          noPayments: 'No payment history yet',
          noPoints: 'No point history yet',
          pointsUsed: 'Points used',
          balanceUsed: 'Balance used',
          cashDue: 'Cash due',
          charge: 'Top-up',
          order: 'Order',
          settlement: 'Settlement',
          subscription: 'Subscription',
          chargeAmount: 'Top-up amount',
        }
      : {
          paymentMethodLabel: {
            balance: '残高払い',
            deferred: '後払い',
            cash: '現金',
            stripe: 'クレカ',
          } as Record<string, string>,
          subscriptionPaymentMethodLabel: {
            points: 'ポイント',
            balance: '残高',
            cash: '現金',
            mixed: '複合',
          } as Record<string, string>,
          statusLabel: {
            pending: '処理中',
            completed: '完了',
            cancelled: 'キャンセル',
            refunded: '返金済み',
          } as Record<string, string>,
          chargeStatusLabel: {
            approved: '反映済み',
            pending: '未処理',
            rejected: '却下',
            refunded: '返金済み',
            cancelled: '取消',
          } as Record<string, string>,
          settlementStatusLabel: {
            pending: '未精算',
            completed: '精算済み',
          } as Record<string, string>,
          subscriptionStatusLabel: {
            pending_cash_settlement: '現金精算待ち',
            completed: '反映済み',
            cancelled: 'キャンセル',
          } as Record<string, string>,
          fallbackName: 'LIMUメンバー',
          balance: '残高',
          topUp: 'チャージする',
          deferredBalance: '後払い残高',
          deferredNote: '定期精算でお支払い',
          points: 'ポイント',
          pointsNote: '注文時に 1pt = 1円で使えます',
          paymentHistory: '支払履歴',
          pointHistory: 'ポイント履歴',
          favorites: 'お気に入り商品',
          subscriptions: 'サブスク',
          backToProducts: '商品一覧へ',
          available: '購入可能',
          unavailable: '現在は購入不可',
          load: '表示する',
          hide: '閉じる',
          collapsedHint: '開いたときだけ読み込みます。',
          loading: '読み込み中...',
          noPayments: '支払履歴がありません',
          noPoints: 'ポイント履歴がありません',
          pointsUsed: '利用ポイント',
          balanceUsed: '残高利用',
          cashDue: '現金精算',
          charge: 'チャージ',
          order: '商品購入',
          settlement: '精算',
          subscription: 'サブスク',
          chargeAmount: 'チャージ額',
        };

  const fetchPayments = async (offset = 0) => {
    const res = await fetch(`/api/mypage/payments?offset=${offset}&limit=${PAGE_SIZE}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data.error ?? (locale === 'en' ? 'Failed to load payment history' : '支払履歴の取得に失敗しました')
      );
    }
    return data;
  };

  const fetchPoints = async (offset = 0) => {
    const res = await fetch(`/api/mypage/points?offset=${offset}&limit=${PAGE_SIZE}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data.error ?? (locale === 'en' ? 'Failed to load point history' : 'ポイント履歴の取得に失敗しました')
      );
    }
    return data;
  };

  const loadSection = async (section: HistorySection) => {
    setLoadingSections((current) => ({ ...current, [section]: true }));
    try {
      if (section === 'payments') {
        const data = await fetchPayments();
        setPayments(data.payments ?? []);
        setHasMorePayments(Boolean(data.hasMore));
      } else {
        const data = await fetchPoints();
        setPointTransactions(data.pointTransactions ?? []);
        setHasMorePoints(Boolean(data.hasMore));
      }
      setLoadedSections((current) => ({ ...current, [section]: true }));
    } finally {
      setLoadingSections((current) => ({ ...current, [section]: false }));
    }
  };

  const toggleSection = async (section: HistorySection) => {
    const willOpen = !openSections[section];
    setOpenSections((current) => ({ ...current, [section]: willOpen }));
    if (willOpen && !loadedSections[section]) {
      await loadSection(section);
    }
  };

  const loadMorePayments = async () => {
    setLoadingSections((current) => ({ ...current, payments: true }));
    try {
      const data = await fetchPayments(payments.length);
      setPayments((current) => [...current, ...(data.payments ?? [])]);
      setHasMorePayments(Boolean(data.hasMore));
    } finally {
      setLoadingSections((current) => ({ ...current, payments: false }));
    }
  };

  const loadMorePoints = async () => {
    setLoadingSections((current) => ({ ...current, points: true }));
    try {
      const data = await fetchPoints(pointTransactions.length);
      setPointTransactions((current) => [...current, ...(data.pointTransactions ?? [])]);
      setHasMorePoints(Boolean(data.hasMore));
    } finally {
      setLoadingSections((current) => ({ ...current, points: false }));
    }
  };

  const formatPaymentMethod = (entry: UnifiedPaymentEntry) => {
    if (entry.kind === 'subscription') {
      return copy.subscriptionPaymentMethodLabel[entry.payment_method] ?? entry.payment_method;
    }

    if (entry.payment_method.startsWith('deferred:')) {
      const [, settlementMethod] = entry.payment_method.split(':');
      return `${copy.paymentMethodLabel.deferred} / ${copy.paymentMethodLabel[settlementMethod] ?? settlementMethod}`;
    }

    return copy.paymentMethodLabel[entry.payment_method] ?? entry.payment_method;
  };

  const formatPaymentStatus = (entry: UnifiedPaymentEntry) => {
    if (entry.kind === 'charge') {
      return copy.chargeStatusLabel[entry.status] ?? entry.status;
    }
    if (entry.kind === 'settlement') {
      return copy.settlementStatusLabel[entry.status] ?? entry.status;
    }
    if (entry.kind === 'subscription') {
      return copy.subscriptionStatusLabel[entry.status] ?? entry.status;
    }
    return copy.statusLabel[entry.status] ?? entry.status;
  };

  const kindBadgeLabel = (entry: UnifiedPaymentEntry) => {
    switch (entry.kind) {
      case 'charge':
        return copy.charge;
      case 'settlement':
        return copy.settlement;
      case 'subscription':
        return copy.subscription;
      default:
        return copy.order;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.name} className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-espresso text-xl font-bold text-cream-50">
            {(profile?.name ?? copy.fallbackName)[0]}
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold text-espresso">{profile?.name}</h1>
          <p className="text-sm text-espresso-400">{profile?.email}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card space-y-1 bg-espresso text-cream-50">
          <div className="flex items-center gap-2 text-sm text-cream-200">
            <Wallet size={16} />
            <span>{copy.balance}</span>
          </div>
          <p className="font-display text-3xl font-bold">¥{profile?.balance?.toLocaleString() ?? 0}</p>
          <Link
            href="/charge"
            className="mt-1 inline-flex items-center gap-1 text-xs text-matcha-light transition-colors hover:text-matcha"
          >
            {copy.topUp} <ChevronRight size={12} />
          </Link>
        </div>
        <div className="card border-amber-cafe/30 space-y-1">
          <div className="flex items-center gap-2 text-sm text-espresso-400">
            <Clock size={16} />
            <span>{copy.deferredBalance}</span>
          </div>
          <p className="font-display text-3xl font-bold text-espresso">
            ¥{profile?.deferred_balance?.toLocaleString() ?? 0}
          </p>
          <p className="text-xs text-espresso-400">{copy.deferredNote}</p>
        </div>
        <div className="card border-matcha/20 bg-matcha/5 space-y-1">
          <div className="flex items-center gap-2 text-sm text-espresso-500">
            <Coins size={16} />
            <span>{copy.points}</span>
          </div>
          <p className="font-display text-3xl font-bold text-espresso">
            {(profile?.points_balance ?? 0).toLocaleString()}pt
          </p>
          <p className="text-xs text-espresso-400">{copy.pointsNote}</p>
        </div>
      </div>

      <HistorySectionCard
        title={copy.paymentHistory}
        isOpen={openSections.payments}
        isLoaded={loadedSections.payments}
        isLoading={loadingSections.payments}
        onToggle={() => toggleSection('payments')}
        loadLabel={copy.load}
        hideLabel={copy.hide}
        collapsedHint={copy.collapsedHint}
        loadingLabel={copy.loading}
      >
        {!loadedSections.payments || loadingSections.payments ? (
          <p className="py-6 text-sm text-espresso-400">{copy.loading}</p>
        ) : payments.length === 0 ? (
          <p className="py-6 text-sm text-espresso-400">{copy.noPayments}</p>
        ) : (
          <div className="space-y-3">
            {payments.map((entry) => (
              <div key={`${entry.kind}:${entry.id}`} className="space-y-2 rounded-xl border border-cream-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-espresso-400">
                    {format(new Date(entry.created_at), locale === 'en' ? 'MMM d HH:mm' : 'M月d日 HH:mm', {
                      locale: dateLocale,
                    })}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs text-espresso-600">
                      {kindBadgeLabel(entry)}
                    </span>
                    <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs text-espresso-600">
                      {formatPaymentMethod(entry)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        ['completed', 'approved'].includes(entry.status)
                          ? 'bg-green-100 text-green-700'
                          : ['pending', 'pending_cash_settlement'].includes(entry.status)
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {formatPaymentStatus(entry)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-espresso">{entry.title}</p>
                  <p className="mt-1 text-sm text-espresso-500">{entry.detail}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(entry.points_used ?? 0) > 0 && (
                      <span className="rounded-full bg-matcha/10 px-2.5 py-1 text-matcha-dark">
                        {copy.pointsUsed}: {entry.points_used}pt
                      </span>
                    )}
                    {(entry.balance_used ?? 0) > 0 && (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                        {copy.balanceUsed}: ¥{entry.balance_used?.toLocaleString()}
                      </span>
                    )}
                    {(entry.cash_due_amount ?? 0) > 0 && (
                      <span className="rounded-full bg-amber-cafe/10 px-2.5 py-1 text-amber-cafe">
                        {copy.cashDue}: ¥{entry.cash_due_amount?.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <span className="font-display font-bold text-espresso">
                    {entry.kind === 'charge' ? '+' : ''}¥{entry.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            {hasMorePayments && (
              <button
                type="button"
                onClick={loadMorePayments}
                disabled={loadingSections.payments}
                className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50 disabled:opacity-60"
              >
                {loadingSections.payments ? copy.loading : copy.load}
              </button>
            )}
          </div>
        )}
      </HistorySectionCard>

      {favorites.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-espresso">{copy.favorites}</h2>
            <div className="flex items-center gap-2">
              <Link
                href="/subscriptions"
                className="inline-flex items-center gap-1 text-xs text-espresso-400 transition-colors hover:text-espresso-600"
              >
                {copy.subscriptions} <ChevronRight size={12} />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs text-espresso-400 transition-colors hover:text-espresso-600"
              >
                {copy.backToProducts} <ChevronRight size={12} />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {favorites.map((favorite) => (
              <div key={favorite.item.id} className="rounded-xl border border-cream-200 p-3">
                <p className="font-medium text-espresso">{getItemDisplayName(favorite.item, locale)}</p>
                <p className="mt-1 text-sm text-espresso-400">¥{favorite.item.price.toLocaleString()}</p>
                <p className="mt-2 text-xs text-espresso-400">
                  {favorite.item.is_available && favorite.item.stock > 0 ? copy.available : copy.unavailable}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <LegacyTransferRequestCard latestRequest={latestLegacyTransferRequest as any} />

      <HistorySectionCard
        title={copy.pointHistory}
        isOpen={openSections.points}
        isLoaded={loadedSections.points}
        isLoading={loadingSections.points}
        onToggle={() => toggleSection('points')}
        loadLabel={copy.load}
        hideLabel={copy.hide}
        collapsedHint={copy.collapsedHint}
        loadingLabel={copy.loading}
      >
        {!loadedSections.points || loadingSections.points ? (
          <p className="py-6 text-sm text-espresso-400">{copy.loading}</p>
        ) : pointTransactions.length === 0 ? (
          <p className="py-6 text-sm text-espresso-400">{copy.noPoints}</p>
        ) : (
          <div className="space-y-2">
            {pointTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-cream-200 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-espresso">{POINT_REASON_LABELS[transaction.reason_type]}</p>
                  <p className="text-xs text-espresso-400">
                    {format(
                      new Date(transaction.created_at),
                      locale === 'en' ? 'MMM d HH:mm' : 'M月d日 HH:mm',
                      { locale: dateLocale }
                    )}
                  </p>
                  {transaction.note ? <p className="mt-1 text-xs text-espresso-400">{transaction.note}</p> : null}
                </div>
                <div className="text-right">
                  <p
                    className={`font-mono font-semibold ${
                      transaction.delta >= 0 ? 'text-matcha-dark' : 'text-amber-700'
                    }`}
                  >
                    {transaction.delta >= 0 ? '+' : ''}
                    {transaction.delta.toLocaleString()}pt
                  </p>
                  <p className="text-xs text-espresso-400">{transaction.balance_after.toLocaleString()}pt</p>
                </div>
              </div>
            ))}
            {hasMorePoints && (
              <button
                type="button"
                onClick={loadMorePoints}
                disabled={loadingSections.points}
                className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50 disabled:opacity-60"
              >
                {loadingSections.points ? copy.loading : copy.load}
              </button>
            )}
          </div>
        )}
      </HistorySectionCard>
    </div>
  );
}

function HistorySectionCard({
  title,
  isOpen,
  isLoaded,
  isLoading,
  onToggle,
  loadLabel,
  hideLabel,
  collapsedHint,
  loadingLabel,
  children,
}: {
  title: string;
  isOpen: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  onToggle: () => void;
  loadLabel: string;
  hideLabel: string;
  collapsedHint: string;
  loadingLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-espresso">{title}</h2>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 rounded-full border border-cream-200 px-3 py-1.5 text-xs font-medium text-espresso-500 transition-colors hover:bg-cream-50 hover:text-espresso"
        >
          {isOpen ? hideLabel : loadLabel}
          <ChevronDown size={14} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>
      {isOpen ? children : <p className="text-sm text-espresso-400">{isLoading ? loadingLabel : collapsedHint}</p>}
    </div>
  );
}
