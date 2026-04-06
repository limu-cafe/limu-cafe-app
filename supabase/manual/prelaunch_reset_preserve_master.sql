-- ============================================================
-- 運用開始前リセット用SQL（商品マスタは残す）
-- ============================================================
--
-- 用途:
-- - デバッグで作った注文・残高・申請・金庫データを消したい
-- - 商品・カテゴリは残しておきたい
-- - 旧システムの正式データを改めて入れ直したい
--
-- 注意:
-- - auth.users は消しません
-- - Supabase Authentication のユーザーも消したい場合は
--   Dashboard > Authentication > Users で削除してください
-- - items / categories は残ります
-- - price_watches は残ります。不要なら別途削除してください

truncate table
  public.legacy_transfer_requests,
  public.legacy_purchase_history,
  public.favorite_items,
  public.cashbox_counts,
  public.cashbox_entries,
  public.stock_history,
  public.order_items,
  public.orders,
  public.charge_requests,
  public.settlements,
  public.item_requests,
  public.legacy_users,
  public.users
restart identity;
