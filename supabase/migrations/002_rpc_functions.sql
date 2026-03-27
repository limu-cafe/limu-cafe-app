-- ============================================================
-- 在庫を安全に減算するRPC関数
-- race conditionを防ぐためにPostgreSQLの行ロックを使用
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_stock(p_item_id UUID, p_quantity INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE items
  SET stock = stock - p_quantity
  WHERE id = p_item_id AND stock >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION '在庫が不足しています';
  END IF;
END;
$$ LANGUAGE plpgsql;
