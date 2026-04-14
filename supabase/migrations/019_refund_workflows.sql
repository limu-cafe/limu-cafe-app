ALTER TABLE public.charge_requests
  DROP CONSTRAINT IF EXISTS charge_requests_status_check;

ALTER TABLE public.charge_requests
  ADD CONSTRAINT charge_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded'));

CREATE OR REPLACE FUNCTION refund_charge_request(
  p_charge_request_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_request RECORD;
  v_note TEXT;
BEGIN
  SELECT id, user_id, amount, method, status, note
  INTO v_request
  FROM charge_requests
  WHERE id = p_charge_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'チャージ記録が見つかりません';
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION '反映済みのチャージだけ返金できます';
  END IF;

  UPDATE users
  SET
    balance = balance - v_request.amount,
    deferred_balance = deferred_balance - v_request.amount
  WHERE id = v_request.user_id
    AND balance >= v_request.amount
    AND deferred_balance >= v_request.amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION '現在の残高または後払い残高が不足しているため返金できません';
  END IF;

  IF v_request.method = 'cash' THEN
    INSERT INTO cashbox_entries (
      entry_type,
      direction,
      amount,
      note,
      created_by
    )
    VALUES (
      'manual_out',
      'out',
      v_request.amount,
      CONCAT('チャージ返金: ', p_charge_request_id::text),
      p_actor_id
    );
  END IF;

  v_note := CASE
    WHEN v_request.note IS NULL OR v_request.note = '' THEN '返金処理済み'
    ELSE v_request.note || E'\n返金処理済み'
  END;

  UPDATE charge_requests
  SET
    status = 'refunded',
    note = v_note,
    updated_at = NOW()
  WHERE id = p_charge_request_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refund_order(
  p_order_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  SELECT id, user_id, total_amount, payment_method, payment_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '注文が見つかりません';
  END IF;

  IF v_order.payment_method = 'stripe' THEN
    RAISE EXCEPTION 'クレカ注文の返金はまだ対応していません';
  END IF;

  IF v_order.payment_status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'この注文は返金できません';
  END IF;

  FOR v_item IN
    SELECT item_id, quantity
    FROM order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE items
    SET stock = stock + v_item.quantity
    WHERE id = v_item.item_id;

    INSERT INTO stock_history (
      item_id,
      change_amount,
      reason,
      order_id,
      note,
      created_by
    )
    VALUES (
      v_item.item_id,
      v_item.quantity,
      'adjustment',
      p_order_id,
      '注文返金による在庫戻し',
      p_actor_id
    );
  END LOOP;

  IF v_order.payment_method = 'balance' THEN
    UPDATE users
    SET balance = balance + v_order.total_amount
    WHERE id = v_order.user_id;
  ELSIF v_order.payment_method = 'deferred' THEN
    UPDATE users
    SET deferred_balance = deferred_balance - v_order.total_amount
    WHERE id = v_order.user_id
      AND deferred_balance >= v_order.total_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION '後払い残高を戻せませんでした';
    END IF;
  ELSIF v_order.payment_method = 'cash' AND v_order.payment_status = 'completed' THEN
    INSERT INTO cashbox_entries (
      entry_type,
      direction,
      amount,
      note,
      created_by
    )
    VALUES (
      'manual_out',
      'out',
      v_order.total_amount,
      CONCAT('注文返金: ', p_order_id::text),
      p_actor_id
    );
  END IF;

  UPDATE orders
  SET payment_status = 'refunded'
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;
