CREATE OR REPLACE FUNCTION cancel_non_card_order(
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

  IF v_order.payment_method NOT IN ('balance', 'deferred') THEN
    RAISE EXCEPTION 'この支払い方法の注文はキャンセルできません';
  END IF;

  IF v_order.payment_status <> 'completed' THEN
    RAISE EXCEPTION '完了済みの注文だけキャンセルできます';
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
      '注文キャンセルによる在庫戻し',
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
  END IF;

  UPDATE orders
  SET payment_status = 'cancelled'
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;
