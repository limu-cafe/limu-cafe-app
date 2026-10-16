BEGIN;

-- One operation ID owns the entire stock/history/purchase/cash/audit transaction.
CREATE TABLE public.stock_restock_operations (
  request_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_restock_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_restock_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock_restock_operations TO service_role;

CREATE FUNCTION public.record_stock_restock(
  p_request_id uuid, p_item_id uuid, p_quantity integer, p_note text,
  p_purchase jsonb, p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_payload jsonb;
  v_existing public.stock_restock_operations%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_stock integer;
  v_updated_at timestamptz;
  v_purchase_id uuid;
  v_total integer;
  v_source text;
  v_unit_price integer;
  v_purchase_summary jsonb := NULL;
  v_result jsonb;
BEGIN
  IF p_request_id IS NULL OR p_item_id IS NULL OR p_actor_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION '商品・操作ID・操作者・正の入荷数を指定してください' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_note, '')) > 2000 THEN
    RAISE EXCEPTION '入荷メモが長すぎます' USING ERRCODE = '22023';
  END IF;
  IF p_purchase IS NOT NULL THEN
    IF jsonb_typeof(p_purchase) <> 'object' OR jsonb_typeof(p_purchase->'total_amount') IS DISTINCT FROM 'number'
      OR coalesce(p_purchase->>'payment_source', '') NOT IN ('cashbox', 'personal_advance') THEN
      RAISE EXCEPTION '仕入れ情報が不正です' USING ERRCODE = '22023';
    END IF;
    IF (p_purchase->>'total_amount')::numeric <= 0 OR (p_purchase->>'total_amount')::numeric > 2147483647
      OR (p_purchase->>'total_amount')::numeric <> trunc((p_purchase->>'total_amount')::numeric) THEN
      RAISE EXCEPTION '仕入れ合計額は1円以上の整数を指定してください' USING ERRCODE = '22023';
    END IF;
    v_total := (p_purchase->>'total_amount')::integer;
    v_source := p_purchase->>'payment_source';
    v_unit_price := round(v_total::numeric / p_quantity)::integer;
  END IF;
  v_payload := jsonb_build_object('item_id', p_item_id, 'quantity', p_quantity, 'note', p_note, 'purchase', p_purchase, 'actor_id', p_actor_id);
  INSERT INTO public.stock_restock_operations(request_id, payload) VALUES (p_request_id, v_payload)
    ON CONFLICT (request_id) DO NOTHING;
  SELECT * INTO v_existing FROM public.stock_restock_operations WHERE request_id = p_request_id FOR UPDATE;
  IF v_existing.payload IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION '同じ操作IDで内容を変更できません' USING ERRCODE = '22023';
  END IF;
  IF v_existing.result IS NOT NULL THEN RETURN v_existing.result; END IF;

  -- The same item-row lock is used by decrement_stock. Always add to the current locked row.
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '商品が見つかりません' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(v_item.is_unlimited_stock, false) THEN
    RAISE EXCEPTION '在庫管理なしの商品には入荷できません' USING ERRCODE = '22023';
  END IF;
  UPDATE public.items SET stock = stock + p_quantity WHERE id = p_item_id RETURNING stock, updated_at INTO v_stock, v_updated_at;
  INSERT INTO public.stock_history(item_id, change_amount, reason, note, created_by)
    VALUES (p_item_id, p_quantity, 'restock', coalesce(p_note, '入荷'), p_actor_id);
  IF p_purchase IS NOT NULL THEN
    INSERT INTO public.purchase_runs(total_amount, payment_source, reimbursement_status, vendor, note, purchased_by, created_by)
      VALUES (v_total, v_source, CASE WHEN v_source = 'cashbox' THEN 'not_needed' ELSE 'pending_reimbursement' END,
        p_purchase->>'vendor', p_purchase->>'note', p_actor_id, p_actor_id) RETURNING id INTO v_purchase_id;
    INSERT INTO public.purchase_run_items(purchase_run_id, item_id, item_name, quantity, unit_price, subtotal)
      VALUES (v_purchase_id, p_item_id, v_item.name, p_quantity, v_unit_price, v_total);
    IF v_source = 'cashbox' THEN
      INSERT INTO public.cashbox_entries(entry_type, direction, amount, purchase_run_id, note, created_by)
        VALUES ('restock_cash_out', 'out', v_total, v_purchase_id,
          coalesce(p_purchase->>'note', '仕入れ: ' || v_item.name), p_actor_id);
    END IF;
    v_purchase_summary := jsonb_build_object('payment_source', v_source, 'vendor', p_purchase->>'vendor',
      'unit_price', v_unit_price, 'total_amount', v_total, 'reimbursement_status',
      CASE WHEN v_source = 'cashbox' THEN 'not_needed' ELSE 'pending_reimbursement' END,
      'purchase_run_id', v_purchase_id, 'note', p_purchase->>'note');
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id, action_type, target_type, target_id, summary, metadata)
    VALUES (p_actor_id, 'stock_restocked', 'item', p_item_id::text, v_item.name || ' の在庫を ' || p_quantity::text || ' 個追加しました',
      jsonb_build_object('request_id', p_request_id, 'quantity', p_quantity, 'note', p_note,
        'stock_before', v_item.stock, 'stock_after', v_stock, 'purchase', v_purchase_summary));
  v_result := jsonb_build_object('ok', true, 'stock', v_stock, 'updated_at', v_updated_at, 'purchase', v_purchase_summary);
  UPDATE public.stock_restock_operations SET result = v_result WHERE request_id = p_request_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_stock_restock(uuid, uuid, integer, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_restock(uuid, uuid, integer, text, jsonb, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
