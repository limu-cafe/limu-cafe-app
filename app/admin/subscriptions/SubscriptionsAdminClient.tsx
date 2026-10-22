'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import ObjectDetailNavigation, { useObjectDetailView } from '@/components/admin/ObjectDetailNavigation';
import { useRouter } from 'next/navigation';
import { ChevronDown, Repeat2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  SubscriptionBillingIntervalUnit,
  SubscriptionPaymentPriority,
  SubscriptionProduct,
  SubscriptionStatus,
  UserSubscription,
} from '@/types';
import {
  formatSubscriptionInterval,
  getSubscriptionDisplayName,
  sanitizeSubscriptionPaymentPriority,
  storageDateToMonthValue,
  SUBSCRIPTION_PRIORITY_OPTIONS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/lib/subscriptions';

type ProductDraft = {
  name: string;
  english_name: string;
  description: string;
  price: string;
  billing_interval_count: string;
  billing_interval_unit: SubscriptionBillingIntervalUnit;
  points_enabled: boolean;
  balance_enabled: boolean;
  is_active: boolean;
};

type SubscriptionMember = UserSubscription & {
  user?: {
    id: string;
    name: string;
    email?: string | null;
    avatar_url?: string | null;
    balance: number;
    points_balance: number;
  } | null;
};

type MemberDraft = {
  status: SubscriptionStatus;
  endMonth: string;
  paymentPriority: SubscriptionPaymentPriority[];
  allowPartialPayment: boolean;
};

const METHOD_LABELS: Record<SubscriptionPaymentPriority, string> = {
  points: 'ポイント',
  balance: '残高',
  cash: '現金',
};

function createProductDraft(product: SubscriptionProduct): ProductDraft {
  return {
    name: product.name,
    english_name: product.english_name ?? '',
    description: product.description ?? '',
    price: String(product.price),
    billing_interval_count: String(product.billing_interval_count),
    billing_interval_unit: product.billing_interval_unit,
    points_enabled: product.points_enabled,
    balance_enabled: product.balance_enabled,
    is_active: product.is_active,
  };
}

function createMemberDraft(member: SubscriptionMember): MemberDraft {
  return {
    status: member.status,
    endMonth: storageDateToMonthValue(member.end_month),
    paymentPriority: sanitizeSubscriptionPaymentPriority(member.payment_priority),
    allowPartialPayment: member.allow_partial_payment,
  };
}

export default function SubscriptionsAdminClient({
  products,
}: {
  products: SubscriptionProduct[];
}) {
  const router = useRouter();
  const [selectedId,selectProduct]=useObjectSelection('product');
  const [memberId,selectMember]=useObjectSelection('member');
  const [detailView,setDetailView]=useObjectDetailView(['overview','members']);
  const [creating,setCreating]=useState(false);
  const [search,setSearch]=useState('');
  const [memberErrors,setMemberErrors]=useState<Record<string,string>>({});
  const selected=products.find(product=>product.id===selectedId);

  const [createForm, setCreateForm] = useState<ProductDraft>({
    name: '',
    english_name: '',
    description: '',
    price: '1000',
    billing_interval_count: '1',
    billing_interval_unit: 'month',
    points_enabled: true,
    balance_enabled: true,
    is_active: true,
  });
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>(() =>
    Object.fromEntries(products.map((product) => [product.id, createProductDraft(product)]))
  );
  const [membersByProduct, setMembersByProduct] = useState<Record<string, SubscriptionMember[]>>({});
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const createSubscriptionProduct = async () => {
    if (!createForm.name.trim()) {
      toast.error('サブスク名を入力してください');
      return;
    }

    setLoading('create-product');
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          english_name: createForm.english_name || null,
          description: createForm.description || null,
          price: Number(createForm.price),
          billing_interval_count: Number(createForm.billing_interval_count),
          billing_interval_unit: createForm.billing_interval_unit,
          points_enabled: createForm.points_enabled,
          balance_enabled: createForm.balance_enabled,
          is_active: createForm.is_active,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '作成に失敗しました');
      toast.success('サブスク商品を追加しました');
      setCreateForm((current) => ({ ...current, name: '', english_name: '', description: '' }));
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const saveProduct = async (productId: string) => {
    const draft = productDrafts[productId];
    if (!draft || !draft.name.trim()) {
      toast.error('サブスク名を入力してください');
      return;
    }

    setLoading(`save-product:${productId}`);
    try {
      const res = await fetch(`/api/admin/subscriptions/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          english_name: draft.english_name || null,
          description: draft.description || null,
          price: Number(draft.price),
          billing_interval_count: Number(draft.billing_interval_count),
          billing_interval_unit: draft.billing_interval_unit,
          points_enabled: draft.points_enabled,
          balance_enabled: draft.balance_enabled,
          is_active: draft.is_active,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '更新に失敗しました');
      toast.success('サブスク商品を更新しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const toggleMembers = async (productId: string) => {
    if (!membersByProduct[productId]) {
      setLoading(`load-members:${productId}`);
      setMemberErrors(current=>({...current,[productId]:''}));
      try {
        const res = await fetch(`/api/admin/subscriptions/${productId}/members`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? '契約者一覧の取得に失敗しました');
        const members = (payload.members ?? []) as SubscriptionMember[];
        setMembersByProduct((current) => ({ ...current, [productId]: members }));
        setMemberDrafts((current) => {
          const next = { ...current };
          for (const member of members) {
            if (!next[member.id]) {
              next[member.id] = createMemberDraft(member);
            }
          }
          return next;
        });
      } catch (error: any) {
        setMemberErrors(current=>({...current,[productId]:error.message}));
        toast.error(error.message);
      } finally {
        setLoading(null);
      }
    }
  };

  const saveMember = async (productId: string, memberId: string) => {
    const draft = memberDrafts[memberId];
    if (!draft?.endMonth) {
      toast.error('終了予定年月を入力してください');
      return;
    }

    setLoading(`save-member:${memberId}`);
    try {
      const res = await fetch(`/api/admin/subscription-members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: draft.status,
          end_month: draft.endMonth,
          payment_priority: draft.paymentPriority,
          allow_partial_payment: draft.allowPartialPayment,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '契約更新に失敗しました');
      toast.success('契約内容を更新しました');
      setMembersByProduct((current) => {
        const members = current[productId] ?? [];
        return {
          ...current,
          [productId]: members.map((member) =>
            member.id === memberId
              ? {
                  ...member,
                  status: draft.status,
                  end_month: `${draft.endMonth}-01`,
                  payment_priority: draft.paymentPriority,
                  allow_partial_payment: draft.allowPartialPayment,
                }
              : member
          ),
        };
      });
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const updateMemberPriority = (
    memberId: string,
    index: number,
    nextValue: SubscriptionPaymentPriority
  ) => {
    setMemberDrafts((current) => {
      const currentDraft = current[memberId];
      if (!currentDraft) return current;
      const nextPriority = [...currentDraft.paymentPriority];
      nextPriority[index] = nextValue;
      return {
        ...current,
        [memberId]: {
          ...currentDraft,
          paymentPriority: sanitizeSubscriptionPaymentPriority(nextPriority),
        },
      };
    });
  };

  useEffect(()=>{if(selectedId&&detailView==='members')void toggleMembers(selectedId);},[selectedId,detailView]);
  return <div className={`space-y-5 ${selected?'':'mx-auto max-w-3xl'}`}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-white">サブスク商品</h1><p className="mt-1 text-sm text-gray-400">商品を選び、その商品情報と契約者を確認します。</p></div><button type="button" onClick={()=>setCreating(value=>!value)} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950">{creating?'追加を閉じる':'サブスク商品を追加'}</button></header>
    {creating&&<section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            type="text"
            value={createForm.name}
            onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
            aria-label="サブスク名" placeholder="サブスク名"
            className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-hidden"
          />
          <input
            type="text"
            value={createForm.english_name}
            onChange={(event) =>
              setCreateForm((current) => ({ ...current, english_name: event.target.value }))
            }
            aria-label="英語名" placeholder="英語名"
            className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-hidden"
          />
          <input
            type="number"
            min={1}
            value={createForm.price}
            onChange={(event) => setCreateForm((current) => ({ ...current, price: event.target.value }))}
            aria-label="価格" placeholder="価格"
            className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
            <input
              type="number"
              min={1}
              aria-label="請求間隔" value={createForm.billing_interval_count}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, billing_interval_count: event.target.value }))
              }
              className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
            />
            <select
              aria-label="請求単位" value={createForm.billing_interval_unit}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  billing_interval_unit: event.target.value as SubscriptionBillingIntervalUnit,
                }))
              }
              className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
            >
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">か月</option>
            </select>
            <button
              type="button"
              onClick={createSubscriptionProduct}
              disabled={loading === 'create-product'}
              className="whitespace-nowrap rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-gray-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              {loading === 'create-product' ? '...' : '追加'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <textarea
            value={createForm.description}
            onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
            aria-label="説明" placeholder="説明"
            rows={3}
            className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-hidden"
          />
          <div className="grid gap-2 text-sm text-gray-300">
            <label className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
              <input
                type="checkbox"
                checked={createForm.points_enabled}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, points_enabled: event.target.checked }))
                }
              />
              ポイント利用可
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
              <input
                type="checkbox"
                checked={createForm.balance_enabled}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, balance_enabled: event.target.checked }))
                }
              />
              残高利用可
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(event) => setCreateForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              ユーザー画面に表示する
            </label>
          </div>
        </div>
      </section>}
    <ObjectWorkspace selected={Boolean(selected)} label="サブスク商品の詳細" onClose={()=>selectProduct(null)} collection={<div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900"><label className="block border-b border-gray-800 p-4"><span className="sr-only">サブスク商品を検索</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="サブスク名で検索" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"/></label>{products.filter(product=>product.name.includes(search)).map(product=><button key={product.id} type="button" aria-pressed={product.id===selectedId} onClick={()=>selectProduct(product.id)} className="flex w-full items-center gap-4 border-b border-gray-800 px-4 py-4 text-left hover:bg-gray-800"><span className="min-w-0 flex-1 text-white">{getSubscriptionDisplayName(product,'ja')}<small className="mt-1 block text-gray-400">{product.is_active?'表示中':'非表示'}</small></span><span className="text-sm text-gray-200">¥{product.price.toLocaleString()} / {formatSubscriptionInterval(product.billing_interval_count,product.billing_interval_unit)}</span></button>)}</div>} detail={<>
        {products.filter(product=>product.id===selectedId).map((product) => {
          const draft = productDrafts[product.id] ?? createProductDraft(product);
          const members = membersByProduct[product.id] ?? [];
          const visibleName = getSubscriptionDisplayName(product, 'ja');

          return <section key={product.id}>
            <h2 className="text-xl font-bold text-white">{visibleName}</h2><p className="mt-2 text-sm text-gray-400">¥{product.price.toLocaleString()} / {formatSubscriptionInterval(product.billing_interval_count,product.billing_interval_unit)} · {product.is_active?'表示中':'非表示'}</p>
            <ObjectDetailNavigation value={detailView} onChange={setDetailView} options={[{id:'overview',label:'商品情報'},{id:'members',label:'契約者'}]}/>
            {detailView==='overview'&&<><p className="mt-4 whitespace-pre-wrap text-sm text-gray-300">{product.description||'説明なし'}</p><p className="mt-3 text-sm text-gray-400">ポイント {product.points_enabled?'利用可':'利用不可'} · 残高 {product.balance_enabled?'利用可':'利用不可'}</p><details className="mt-5"><summary className="cursor-pointer text-sm text-sky-300">商品情報を編集</summary><div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  aria-label="商品名" value={draft.name}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, name: event.target.value },
                    }))
                  }
                  className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                />
                <input
                  type="text"
                  aria-label="英語名" value={draft.english_name}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, english_name: event.target.value },
                    }))
                  }
                  className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                />
                <input
                  type="number"
                  min={1}
                  aria-label="価格" value={draft.price}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, price: event.target.value },
                    }))
                  }
                  className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    aria-label="請求間隔" value={draft.billing_interval_count}
                    onChange={(event) =>
                      setProductDrafts((current) => ({
                        ...current,
                        [product.id]: { ...draft, billing_interval_count: event.target.value },
                      }))
                    }
                    className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                  />
                  <select
                    aria-label="請求単位" value={draft.billing_interval_unit}
                    onChange={(event) =>
                      setProductDrafts((current) => ({
                        ...current,
                        [product.id]: {
                          ...draft,
                          billing_interval_unit: event.target.value as SubscriptionBillingIntervalUnit,
                        },
                      }))
                    }
                    className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                  >
                    <option value="day">日</option>
                    <option value="week">週</option>
                    <option value="month">か月</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => saveProduct(product.id)}
                  disabled={loading === `save-product:${product.id}`}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-950 transition hover:bg-gray-200 disabled:opacity-60"
                >
                  {loading === `save-product:${product.id}` ? '...' : '保存'}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <textarea
                  aria-label="説明" value={draft.description}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, description: event.target.value },
                    }))
                  }
                  rows={3}
                  className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden"
                />
                <div className="grid gap-2 text-sm text-gray-300">
                  <div className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-white">
                    ¥{product.price.toLocaleString()} / {formatSubscriptionInterval(product.billing_interval_count, product.billing_interval_unit)}
                  </div>
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      draft.is_active
                        ? 'border-green-500/20 bg-green-500/10 text-green-300'
                        : 'border-gray-700 bg-gray-950/40 text-gray-300'
                    }`}
                  >
                    {draft.is_active ? '表示中' : '非表示'}
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draft.points_enabled}
                      onChange={(event) =>
                        setProductDrafts((current) => ({
                          ...current,
                          [product.id]: { ...draft, points_enabled: event.target.checked },
                        }))
                      }
                    />
                    ポイント利用可
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draft.balance_enabled}
                      onChange={(event) =>
                        setProductDrafts((current) => ({
                          ...current,
                          [product.id]: { ...draft, balance_enabled: event.target.checked },
                        }))
                      }
                    />
                    残高利用可
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={(event) =>
                        setProductDrafts((current) => ({
                          ...current,
                          [product.id]: { ...draft, is_active: event.target.checked },
                        }))
                      }
                    />
                    ユーザー画面に表示する
                  </label>
                </div>
              </div>

            </div></details></>}
              {detailView==='members' && (
                <div className="mt-4 space-y-3 border-t border-gray-800 pt-4">
                  {memberErrors[product.id] ? <div role="alert" className="text-sm text-amber-300">{memberErrors[product.id]}<button type="button" onClick={()=>void toggleMembers(product.id)} className="ml-3 underline">再試行</button></div> : loading === `load-members:${product.id}` ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-6 text-sm text-gray-500">
                      読み込み中...
                    </div>
                  ) : members.length === 0 ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-6 text-sm text-gray-500">
                      契約者はいません
                    </div>
                  ) : (
                    <><div className="divide-y divide-gray-800 rounded-xl border border-gray-800">{members.map(member=><button key={member.id} type="button" aria-pressed={memberId===member.id} onClick={()=>selectMember(member.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-800"><span className="min-w-0 flex-1 text-white">{member.user?.name??'利用者'}<small className="mt-1 block text-gray-400">{SUBSCRIPTION_STATUS_LABELS[member.status]} · 終了 {storageDateToMonthValue(member.end_month)}</small></span><span className="text-sky-300">契約の詳細 →</span></button>)}</div>
                    {members.filter(member=>member.id===memberId).map((member) => {
                      const draftMember = memberDrafts[member.id] ?? createMemberDraft(member);
                      return (
                        <div key={member.id} aria-label="選択した契約" className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <h3 className="font-medium text-white">{member.user?.name ?? '不明なユーザー'}の契約</h3>{(member.user?.id??member.user_id)&&<Link href={`/admin/users?user=${member.user?.id??member.user_id}&view=subscriptions`} className="mt-2 inline-block text-xs text-sky-300 underline">この利用者の契約を見る →</Link>}
                              <p className="mt-1 text-xs text-gray-500">
                                次回 {member.next_billing_at?.slice(0, 10) ?? '-'} / 有効期限 {member.current_period_end_at?.slice(0, 10) ?? '-'}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                残高 ¥{member.user?.balance?.toLocaleString() ?? 0} / {member.user?.points_balance?.toLocaleString() ?? 0}pt
                              </p>
                            </div>
                            <label className="space-y-1 text-xs text-gray-500">
                              <span>状態</span>
                              <select
                                value={draftMember.status}
                                onChange={(event) =>
                                  setMemberDrafts((current) => ({
                                    ...current,
                                    [member.id]: {
                                      ...draftMember,
                                      status: event.target.value as SubscriptionStatus,
                                    },
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-hidden"
                              >
                                <option value="active">{SUBSCRIPTION_STATUS_LABELS.active}</option>
                                <option value="cancel_at_period_end">{SUBSCRIPTION_STATUS_LABELS.cancel_at_period_end}</option>
                                <option value="expired">{SUBSCRIPTION_STATUS_LABELS.expired}</option>
                              </select>
                            </label>
                            <label className="space-y-1 text-xs text-gray-500">
                              <span>終了予定年月</span>
                              <input
                                type="month"
                                value={draftMember.endMonth}
                                onChange={(event) =>
                                  setMemberDrafts((current) => ({
                                    ...current,
                                    [member.id]: {
                                      ...draftMember,
                                      endMonth: event.target.value,
                                    },
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-hidden"
                              />
                            </label>
                            <div className="grid grid-cols-3 gap-2"><p className="col-span-3 text-xs text-gray-400">支払いの優先順位（左から1・2・3）</p>
                              {SUBSCRIPTION_PRIORITY_OPTIONS.map((_, index) => (
                                <select
                                  aria-label={`支払い優先順位 ${index+1}`} key={`${member.id}:${index}`}
                                  value={draftMember.paymentPriority[index]}
                                  onChange={(event) =>
                                    updateMemberPriority(
                                      member.id,
                                      index,
                                      event.target.value as SubscriptionPaymentPriority
                                    )
                                  }
                                  className="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white focus:outline-hidden"
                                >
                                  {SUBSCRIPTION_PRIORITY_OPTIONS.map((method) => (
                                    <option key={method} value={method}>
                                      {METHOD_LABELS[method]}
                                    </option>
                                  ))}
                                </select>
                              ))}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <label className="inline-flex items-center gap-2 text-xs text-gray-400">
                                <input
                                  type="checkbox"
                                  checked={draftMember.allowPartialPayment}
                                  onChange={(event) =>
                                    setMemberDrafts((current) => ({
                                      ...current,
                                      [member.id]: {
                                        ...draftMember,
                                        allowPartialPayment: event.target.checked,
                                      },
                                    }))
                                  }
                                />
                                部分利用
                              </label>
                              <button
                                type="button"
                                onClick={() => saveMember(product.id, member.id)}
                                disabled={loading === `save-member:${member.id}`}
                                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-950 transition hover:bg-gray-200 disabled:opacity-60"
                              >
                                {loading === `save-member:${member.id}` ? '...' : '保存'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}</>
                  )}
                </div>
              )}
          </section>;
        })}
    </>}/>
  </div>;
}
