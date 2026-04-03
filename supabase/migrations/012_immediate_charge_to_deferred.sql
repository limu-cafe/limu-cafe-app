-- ============================================================
-- チャージを即時反映しつつ、同額を後払い残高へ加算する
-- 承認待ちをなくし、月次精算で回収する運用に対応
-- ============================================================

CREATE OR REPLACE FUNCTION apply_immediate_charge_to_deferred(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS TABLE (
  new_balance INTEGER,
  new_deferred_balance INTEGER
) AS $$
BEGIN
  RETURN QUERY
  UPDATE users
  SET
    balance = balance + p_amount,
    deferred_balance = deferred_balance + p_amount
  WHERE id = p_user_id
  RETURNING balance, deferred_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ユーザーが見つかりません';
  END IF;
END;
$$ LANGUAGE plpgsql;
