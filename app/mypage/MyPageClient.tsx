'use client';

import { useState } from 'react';
import { Wallet, Clock, ChevronDown, ChevronRight, Coins } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import ReorderButton from '@/components/user/ReorderButton';
import LegacyTransferRequestCard from './LegacyTransferRequestCard';
import type {
  ChargeRequest,
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

type MyOrder = {
  id: string;
  total_amount: number;
  points_used?: number;
  payment_method: string;
  deferred_settlement_method?: 'cash' | 'stripe' | null;
  payment_status: string;
  created_at: string;
  order_items?: Array<{
    item_name: string;
    quantity: number;
    item?: {
      id: string;
      name: string;
      english_name?: string | null;
      price: number;
      stock: number;
      is_available: boolean;
      stock_alert_threshold: number;
      category_id?: string | null;
      image_url?: string | null;
      description?: string | null;
      popular_override?: 'auto' | 'show' | 'hide';
      new_arrival_override?: 'auto' | 'show' | 'hide';
      created_at?: string;
      updated_at?: string;
    } | null;
  }>;
};

const PAGE_SIZE = 5;

type HistorySection = 'orders' | 'charges' | 'points';

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
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [charges, setCharges] = useState<
    Pick<ChargeRequest, 'id' | 'amount' | 'method' | 'status' | 'created_at'>[]
  >([]);
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([]);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [hasMoreCharges, setHasMoreCharges] = useState(false);
  const [hasMorePoints, setHasMorePoints] = useState(false);
  const [loadedSections, setLoadedSections] = useState<Record<HistorySection, boolean>>({
    orders: false,
    charges: false,
    points: false,
  });
  const [openSections, setOpenSections] = useState<Record<HistorySection, boolean>>({
    orders: false,
    charges: false,
    points: false,
  });
  const [loadingSections, setLoadingSections] = useState<Record<HistorySection, boolean>>({
    orders: false,
    charges: false,
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
          statusLabel: {
            pending: 'Pending',
            completed: 'Completed',
            cancelled: 'Cancelled',
            refunded: 'Refunded',
          } as Record<string, string>,
          chargeMethodLabel: {
            cash: 'Cash',
            stripe: 'Card',
          } as Record<string, string>,
          chargeStatusLabel: {
            approved: 'Applied',
            pending: 'Pending',
            rejected: 'Rejected',
            refunded: 'Refunded',
          } as Record<string, string>,
          fallbackName: 'LIMU Member',
          balance: 'Balance',
          topUp: 'Top up',
          deferredBalance: 'Deferred balance',
          deferredNote: 'Paid on the settlement schedule',
          points: 'Points',
          pointsNote: '1pt = ¥1 when ordering',
          purchaseHistory: 'Purchase history',
          chargeHistory: 'Top-up history',
          pointHistory: 'Point history',
          favorites: 'Favorites',
          backToProducts: 'Back to products',
          available: 'Available now',
          unavailable: 'Unavailable now',
          recent: 'Recent',
          load: 'Show',
          hide: 'Hide',
          collapsedHint: 'Loaded only when you open this section.',
          loadMore: 'Load more',
          loading: 'Loading...',
          noOrders: 'No purchase history yet',
          noCharges: 'No top-up history yet',
          noPoints: 'No point history yet',
          pointsUsed: 'Points used',
        }
      : {
          paymentMethodLabel: {
            balance: '残高払い',
            deferred: '後払い',
            cash: '現金',
            stripe: 'クレカ',
          } as Record<string, string>,
          statusLabel: {
            pending: '処理中',
            completed: '完了',
            cancelled: 'キャンセル',
            refunded: '返金済み',
          } as Record<string, string>,
          chargeMethodLabel: {
            cash: '現金',
            stripe: 'クレカ',
          } as Record<string, string>,
          chargeStatusLabel: {
            approved: '反映済み',
            pending: '未処理',
            rejected: '却下',
            refunded: '返金済み',
          } as Record<string, string>,
          fallbackName: 'LIMUメンバー',
          balance: '残高',
          topUp: 'チャージする',
          deferredBalance: '後払い残高',
          deferredNote: '定期精算でお支払い',
          points: 'ポイント',
          pointsNote: '注文時に 1pt = 1円で使えます',
          purchaseHistory: '購入履歴',
          chargeHistory: 'チャージ履歴',
          pointHistory: 'ポイント履歴',
          favorites: 'お気に入り商品',
          backToProducts: '商品一覧へ',
          available: '購入可能',
          unavailable: '現在は購入不可',
          recent: '直近',
          load: '表示する',
          hide: '閉じる',
          collapsedHint: '開いたときだけ読み込みます。',
          loadMore: 'もっと見る',
          loading: '読み込み中...',
          noOrders: '購入履歴がありません',
          noCharges: 'チャージ履歴がありません',
          noPoints: 'ポイント履歴がありません',
          pointsUsed: '利用ポイント',
        };

  const fetchOrders = async (offset = 0) => {
    const res = await fetch(`/api/mypage/orders?offset=${offset}&limit=${PAGE_SIZE}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? (locale === 'en' ? 'Failed to load orders' : '購入履歴の取得に失敗しました'));
    }
    return data;
  };

  const fetchCharges = async (offset = 0) => {
    const res = await fetch(`/api/mypage/charges?offset=${offset}&limit=${PAGE_SIZE}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data.error ?? (locale === 'en' ? 'Failed to load top-up history' : 'チャージ履歴の取得に失敗しました')
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
      if (section === 'orders') {
        const data = await fetchOrders();
        setOrders(data.orders ?? []);
        setHasMoreOrders(Boolean(data.hasMore));
      } else if (section === 'charges') {
        const data = await fetchCharges();
        setCharges(data.chargeRequests ?? []);
        setHasMoreCharges(Boolean(data.hasMore));
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

  const loadMoreOrders = async () => {
    setLoadingSections((current) => ({ ...current, orders: true }));
    try {
      const data = await fetchOrders(orders.length);
      setOrders((current) => [...current, ...(data.orders ?? [])]);
      setHasMoreOrders(Boolean(data.hasMore));
    } finally {
      setLoadingSections((current) => ({ ...current, orders: false }));
    }
  };

  const loadMoreCharges = async () => {
    setLoadingSections((current) => ({ ...current, charges: true }));
    try {
      const data = await fetchCharges(charges.length);
      setCharges((current) => [...current, ...(data.chargeRequests ?? [])]);
      setHasMoreCharges(Boolean(data.hasMore));
    } finally {
      setLoadingSections((current) => ({ ...current, charges: false }));
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
        title={copy.purchaseHistory}
        isOpen={openSections.orders}
        isLoaded={loadedSections.orders}
        isLoading={loadingSections.orders}
        onToggle={() => toggleSection('orders')}
        loadLabel={copy.load}
        hideLabel={copy.hide}
        collapsedHint={copy.collapsedHint}
        loadingLabel={copy.loading}
      >
        {!loadedSections.orders || loadingSections.orders ? (
          <p className="py-6 text-sm text-espresso-400">{copy.loading}</p>
        ) : orders.length === 0 ? (
          <p className="py-6 text-sm text-espresso-400">{copy.noOrders}</p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="space-y-2 rounded-xl border border-cream-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-espresso-400">
                    {format(new Date(order.created_at), locale === 'en' ? 'MMM d HH:mm' : 'M月d日 HH:mm', {
                      locale: dateLocale,
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs text-espresso-600">
                      {order.payment_method === 'deferred' && order.deferred_settlement_method
                        ? `${copy.paymentMethodLabel[order.payment_method]} / ${copy.paymentMethodLabel[order.deferred_settlement_method]}`
                        : copy.paymentMethodLabel[order.payment_method]}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        order.payment_status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : order.payment_status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {copy.statusLabel[order.payment_status]}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-espresso-600">
                  {order.order_items
                    ?.map((oi) =>
                      oi.item ? getItemDisplayName(oi.item, locale) : oi.item_name
                    )
                    .join(locale === 'en' ? ', ' : '、')}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <ReorderButton orderItems={(order.order_items ?? []) as any} />
                    {order.points_used ? (
                      <p className="text-xs text-matcha-dark">
                        {copy.pointsUsed}: {order.points_used.toLocaleString()}pt
                      </p>
                    ) : null}
                  </div>
                  <span className="font-display font-bold text-espresso">
                    ¥{order.total_amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            {hasMoreOrders && (
              <button
                type="button"
                onClick={loadMoreOrders}
                disabled={loadingSections.orders}
                className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50 disabled:opacity-60"
              >
                {loadingSections.orders ? copy.loading : copy.loadMore}
              </button>
            )}
          </div>
        )}
      </HistorySectionCard>

      {favorites.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-espresso">{copy.favorites}</h2>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-espresso-400 transition-colors hover:text-espresso-600"
            >
              {copy.backToProducts} <ChevronRight size={12} />
            </Link>
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
        title={copy.chargeHistory}
        isOpen={openSections.charges}
        isLoaded={loadedSections.charges}
        isLoading={loadingSections.charges}
        onToggle={() => toggleSection('charges')}
        loadLabel={copy.load}
        hideLabel={copy.hide}
        collapsedHint={copy.collapsedHint}
        loadingLabel={copy.loading}
      >
        {!loadedSections.charges || loadingSections.charges ? (
          <p className="py-6 text-sm text-espresso-400">{copy.loading}</p>
        ) : charges.length === 0 ? (
          <p className="py-6 text-sm text-espresso-400">{copy.noCharges}</p>
        ) : (
          <div className="space-y-2">
            {charges.map((req) => (
              <div key={req.id} className="flex items-center justify-between text-sm">
                <span className="text-espresso-400">
                  {format(new Date(req.created_at), locale === 'en' ? 'MMM d' : 'M月d日', {
                    locale: dateLocale,
                  })}
                  <span className="ml-2 rounded-full bg-cream-100 px-2 py-0.5 text-xs">
                    {copy.chargeMethodLabel[req.method]}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      req.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : req.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {copy.chargeStatusLabel[req.status]}
                  </span>
                  <span className="font-mono font-medium">+¥{req.amount.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {hasMoreCharges && (
              <button
                type="button"
                onClick={loadMoreCharges}
                disabled={loadingSections.charges}
                className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50 disabled:opacity-60"
              >
                {loadingSections.charges ? copy.loading : copy.loadMore}
              </button>
            )}
          </div>
        )}
      </HistorySectionCard>

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
                  <p className="font-medium text-espresso">
                    {locale === 'en'
                      ? POINT_REASON_LABELS[transaction.reason_type]
                      : POINT_REASON_LABELS[transaction.reason_type]}
                  </p>
                  <p className="text-xs text-espresso-400">
                    {format(
                      new Date(transaction.created_at),
                      locale === 'en' ? 'MMM d HH:mm' : 'M月d日 HH:mm',
                      { locale: dateLocale }
                    )}
                  </p>
                  {transaction.note ? (
                    <p className="mt-1 text-xs text-espresso-400">{transaction.note}</p>
                  ) : null}
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
                  <p className="text-xs text-espresso-400">
                    {transaction.balance_after.toLocaleString()}pt
                  </p>
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
                {loadingSections.points ? copy.loading : copy.loadMore}
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
          {isOpen ? hideLabel : isLoaded ? loadLabel : loadLabel}
          <ChevronDown size={14} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>
      {isOpen ? children : (
        <p className="text-sm text-espresso-400">
          {isLoading ? loadingLabel : collapsedHint}
        </p>
      )}
    </div>
  );
}
