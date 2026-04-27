'use client';

import { useState } from 'react';
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
  const [openMembers, setOpenMembers] = useState<Record<string, boolean>>({});
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
    const nextOpen = !openMembers[productId];
    setOpenMembers((current) => ({ ...current, [productId]: nextOpen }));

    if (nextOpen && !membersByProduct[productId]) {
      setLoading(`load-members:${productId}`);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">サブスク管理</h1>
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <input
            type="text"
            value={createForm.name}
            onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="サブスク名"
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none"
          />
          <input
            type="text"
            value={createForm.english_name}
            onChange={(event) =>
              setCreateForm((current) => ({ ...current, english_name: event.target.value }))
            }
            placeholder="英語名"
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none"
          />
          <input
            type="number"
            min={1}
            value={createForm.price}
            onChange={(event) => setCreateForm((current) => ({ ...current, price: event.target.value }))}
            placeholder="価格"
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
          />
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="number"
              min={1}
              value={createForm.billing_interval_count}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, billing_interval_count: event.target.value }))
              }
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
            />
            <select
              value={createForm.billing_interval_unit}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  billing_interval_unit: event.target.value as SubscriptionBillingIntervalUnit,
                }))
              }
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
            >
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">か月</option>
            </select>
            <button
              type="button"
              onClick={createSubscriptionProduct}
              disabled={loading === 'create-product'}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-gray-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              {loading === 'create-product' ? '...' : '追加'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <textarea
            value={createForm.description}
            onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="説明"
            rows={3}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none"
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
      </section>

      <div className="space-y-4">
        {products.map((product) => {
          const draft = productDrafts[product.id] ?? createProductDraft(product);
          const members = membersByProduct[product.id] ?? [];
          const isOpen = openMembers[product.id] ?? false;
          const visibleName = getSubscriptionDisplayName(product, 'ja');

          return (
            <section key={product.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, name: event.target.value },
                    }))
                  }
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                />
                <input
                  type="text"
                  value={draft.english_name}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, english_name: event.target.value },
                    }))
                  }
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                />
                <input
                  type="number"
                  min={1}
                  value={draft.price}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, price: event.target.value },
                    }))
                  }
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={draft.billing_interval_count}
                    onChange={(event) =>
                      setProductDrafts((current) => ({
                        ...current,
                        [product.id]: { ...draft, billing_interval_count: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                  />
                  <select
                    value={draft.billing_interval_unit}
                    onChange={(event) =>
                      setProductDrafts((current) => ({
                        ...current,
                        [product.id]: {
                          ...draft,
                          billing_interval_unit: event.target.value as SubscriptionBillingIntervalUnit,
                        },
                      }))
                    }
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
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

              <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_1fr]">
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setProductDrafts((current) => ({
                      ...current,
                      [product.id]: { ...draft, description: event.target.value },
                    }))
                  }
                  rows={3}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
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

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleMembers(product.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
                >
                  <Users size={15} />
                  {visibleName}の契約者
                  <ChevronDown
                    size={15}
                    className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                  />
                </button>
              </div>

              {isOpen && (
                <div className="mt-4 space-y-3 border-t border-gray-800 pt-4">
                  {loading === `load-members:${product.id}` ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-6 text-sm text-gray-500">
                      読み込み中...
                    </div>
                  ) : members.length === 0 ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-6 text-sm text-gray-500">
                      契約者はいません
                    </div>
                  ) : (
                    members.map((member) => {
                      const draftMember = memberDrafts[member.id] ?? createMemberDraft(member);
                      return (
                        <div key={member.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                            <div>
                              <p className="font-medium text-white">{member.user?.name ?? '不明なユーザー'}</p>
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
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none"
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
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none"
                              />
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {SUBSCRIPTION_PRIORITY_OPTIONS.map((_, index) => (
                                <select
                                  key={`${member.id}:${index}`}
                                  value={draftMember.paymentPriority[index]}
                                  onChange={(event) =>
                                    updateMemberPriority(
                                      member.id,
                                      index,
                                      event.target.value as SubscriptionPaymentPriority
                                    )
                                  }
                                  className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white focus:outline-none"
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
                    })
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
