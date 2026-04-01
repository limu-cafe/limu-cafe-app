import type { SupabaseClient } from '@supabase/supabase-js';

type LegacyUserRow = {
  id: string;
  legacy_balance: number;
  favorite_item_names: string[] | null;
  matched_user_id: string | null;
  transferred_at: string | null;
};

type CurrentUserRow = {
  id: string;
  balance: number;
  deferred_balance: number;
};

export async function applyLegacyTransfer(
  supabase: SupabaseClient<any, any, any>,
  params: {
    requestId: string;
    currentUserId: string;
    legacyUserId: string;
    reviewedBy: string | null;
  }
) {
  const { requestId, currentUserId, legacyUserId, reviewedBy } = params;

  const [{ data: legacyUser, error: legacyUserError }, { data: currentUser, error: currentUserError }] =
    await Promise.all([
      supabase
        .from('legacy_users')
        .select('id, legacy_balance, favorite_item_names, matched_user_id, transferred_at')
        .eq('id', legacyUserId)
        .single(),
      supabase
        .from('users')
        .select('id, balance, deferred_balance')
        .eq('id', currentUserId)
        .single(),
    ]);

  if (legacyUserError || !legacyUser) {
    throw new Error(legacyUserError?.message ?? '旧システムデータが見つかりません');
  }

  if (currentUserError || !currentUser) {
    throw new Error(currentUserError?.message ?? '引き継ぎ先ユーザーが見つかりません');
  }

  const typedLegacyUser = legacyUser as LegacyUserRow;
  const typedCurrentUser = currentUser as CurrentUserRow;

  if (typedLegacyUser.transferred_at) {
    throw new Error('この旧データはすでに引き継ぎ済みです');
  }

  if (typedLegacyUser.matched_user_id && typedLegacyUser.matched_user_id !== currentUserId) {
    throw new Error('この旧データは別ユーザーに紐づいています');
  }

  const positiveBalance = Math.max(typedLegacyUser.legacy_balance, 0);
  const deferredBalance = Math.max(-typedLegacyUser.legacy_balance, 0);

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({
      balance: typedCurrentUser.balance + positiveBalance,
      deferred_balance: typedCurrentUser.deferred_balance + deferredBalance,
    })
    .eq('id', currentUserId);

  if (userUpdateError) {
    throw new Error(userUpdateError.message);
  }

  const favoriteItemNames = Array.isArray(typedLegacyUser.favorite_item_names)
    ? typedLegacyUser.favorite_item_names
    : [];

  if (favoriteItemNames.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id, name')
      .in('name', favoriteItemNames);

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    if ((items ?? []).length > 0) {
      const { error: favoritesError } = await supabase.from('favorite_items').upsert(
        (items ?? []).map((item) => ({
          user_id: currentUserId,
          item_id: item.id,
        })),
        { onConflict: 'user_id,item_id', ignoreDuplicates: true }
      );

      if (favoritesError) {
        throw new Error(favoritesError.message);
      }
    }
  }

  const now = new Date().toISOString();

  const [{ error: legacyUpdateError }, { error: requestUpdateError }] = await Promise.all([
    supabase
      .from('legacy_users')
      .update({
        matched_user_id: currentUserId,
        matched_by: reviewedBy,
        matched_at: now,
        transferred_at: now,
        updated_at: now,
      })
      .eq('id', legacyUserId),
    supabase
      .from('legacy_transfer_requests')
      .update({
        status: 'completed',
        matched_legacy_user_id: legacyUserId,
        reviewed_by: reviewedBy,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', requestId),
  ]);

  if (legacyUpdateError) {
    throw new Error(legacyUpdateError.message);
  }

  if (requestUpdateError) {
    throw new Error(requestUpdateError.message);
  }
}
