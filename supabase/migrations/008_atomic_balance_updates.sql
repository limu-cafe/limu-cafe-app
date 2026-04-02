-- ============================================================
-- 注文時の残高更新を原子的に行うRPC関数
-- 同一ユーザーの同時注文でも balance / deferred_balance が壊れないようにする
-- ============================================================

CREATE OR REPLACE FUNCTION decrement_user_balance_if_available(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE users
  SET balance = balance - p_amount
  WHERE id = p_user_id
    AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION '残高が不足しています';
  END IF;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_user_deferred_balance(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_new_deferred_balance INTEGER;
BEGIN
  UPDATE users
  SET deferred_balance = deferred_balance + p_amount
  WHERE id = p_user_id
  RETURNING deferred_balance INTO v_new_deferred_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ユーザーが見つかりません';
  END IF;

  RETURN v_new_deferred_balance;
END;
$$ LANGUAGE plpgsql;
