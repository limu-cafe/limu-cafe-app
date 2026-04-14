'use client';

import { useState } from 'react';
import { Wallet, Clock, ShoppingBag, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import ReorderButton from '@/components/user/ReorderButton';
import LegacyTransferRequestCard from './LegacyTransferRequestCard';
import type { ChargeRequest, LegacyTransferRequest, User } from '@/types';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import { getItemDisplayName } from '@/lib/item-display';

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

const PAGE_SIZE = 3;

export default function MyPageClient({
  profile,
  initialOrders,
  initialCharges,
  initialHasMoreOrders,
  initialHasMoreCharges,
  favorites,
  latestLegacyTransferRequest,
}: {
  profile: Pick<User, 'name' | 'email' | 'avatar_url' | 'balance' | 'deferred_balance'> | null;
  initialOrders: MyOrder[];
  initialCharges: Pick<ChargeRequest, 'id' | 'amount' | 'method' | 'status' | 'created_at'>[];
  initialHasMoreOrders: boolean;
  initialHasMoreCharges: boolean;
  favorites: FavoriteCard[];
  latestLegacyTransferRequest: LegacyTransferRequest | null;
}) {
  const { locale } = useUserLocale();
  const [orders, setOrders] = useState(initialOrders);
  const [charges, setCharges] = useState(initialCharges);
  const [hasMoreOrders, setHasMoreOrders] = useState(initialHasMoreOrders);
  const [hasMoreCharges, setHasMoreCharges] = useState(initialHasMoreCharges);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCharges, setLoadingCharges] = useState(false);
  const dateLocale = locale === 'en' ? enUS : ja;

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
          purchaseHistory: 'Purchase history',
          recent: 'Recent',
          countSuffix: '',
          noOrders: 'No purchase history yet',
          loadMore: 'Load more',
          loading: 'Loading...',
          favorites: 'Favorites',
          backToProducts: 'Back to products',
          available: 'Available now',
          unavailable: 'Unavailable now',
          chargeHistory: 'Top-up history',
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
          purchaseHistory: '購入履歴',
          recent: '直近',
          countSuffix: '件',
          noOrders: '購入履歴がありません',
          loadMore: 'もっと見る',
          loading: '読み込み中...',
          favorites: 'お気に入り商品',
          backToProducts: '商品一覧へ',
          available: '購入可能',
          unavailable: '現在は購入不可',
          chargeHistory: 'チャージ履歴',
        };

  const loadMoreOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`/api/mypage/orders?offset=${orders.length}&limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? (locale === 'en' ? 'Failed to load orders' : '購入履歴の取得に失敗しました'));
      setOrders((current) => [...current, ...(data.orders ?? [])]);
      setHasMoreOrders(Boolean(data.hasMore));
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadMoreCharges = async () => {
    setLoadingCharges(true);
    try {
      const res = await fetch(`/api/mypage/charges?offset=${charges.length}&limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? (locale === 'en' ? 'Failed to load top-up history' : 'チャージ履歴の取得に失敗しました'));
      setCharges((current) => [...current, ...(data.chargeRequests ?? [])]);
      setHasMoreCharges(Boolean(data.hasMore));
    } finally {
      setLoadingCharges(false);
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

      <div className="grid grid-cols-2 gap-4">
        <div className="card bg-espresso text-cream-50 space-y-1">
          <div className="flex items-center gap-2 text-sm text-cream-200">
            <Wallet size={16} />
            <span>{copy.balance}</span>
          </div>
          <p className="font-display text-3xl font-bold">
            ¥{profile?.balance?.toLocaleString() ?? 0}
          </p>
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
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium text-espresso">
            <ShoppingBag size={18} />
            {copy.purchaseHistory}
          </h2>
          <span className="text-xs text-espresso-400">{copy.recent} {orders.length}{copy.countSuffix}</span>
        </div>

        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-espresso-400">{copy.noOrders}</p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="space-y-2 rounded-xl border border-cream-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-espresso-400">
                    {format(new Date(order.created_at), locale === 'en' ? 'MMM d HH:mm' : 'M月d日 HH:mm', { locale: dateLocale })}
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
                <div className="flex items-center justify-between">
                  <ReorderButton orderItems={(order.order_items ?? []) as any} />
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
                disabled={loadingOrders}
                className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50 disabled:opacity-60"
              >
                {loadingOrders ? copy.loading : copy.loadMore}
              </button>
            )}
          </div>
        )}
      </div>

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
                <p className="font-medium text-espresso">
                  {getItemDisplayName(favorite.item, locale)}
                </p>
                <p className="mt-1 text-sm text-espresso-400">
                  ¥{favorite.item.price.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-espresso-400">
                  {favorite.item.is_available && favorite.item.stock > 0
                    ? copy.available
                    : copy.unavailable}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <LegacyTransferRequestCard latestRequest={latestLegacyTransferRequest as any} />

      {charges.length > 0 && (
        <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium text-espresso">
            <Wallet size={18} />
            {copy.chargeHistory}
          </h2>
          <span className="text-xs text-espresso-400">{copy.recent} {charges.length}{copy.countSuffix}</span>
        </div>
          <div className="space-y-2">
            {charges.map((req) => (
              <div key={req.id} className="flex items-center justify-between text-sm">
                <span className="text-espresso-400">
                  {format(new Date(req.created_at), locale === 'en' ? 'MMM d' : 'M月d日', { locale: dateLocale })}
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
                disabled={loadingCharges}
                className="w-full rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm font-medium text-espresso transition-colors hover:bg-cream-50 disabled:opacity-60"
              >
                {loadingCharges ? copy.loading : copy.loadMore}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
