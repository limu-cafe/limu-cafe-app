-- ============================================================
-- 金庫管理テーブル
-- 現金の理論残高と実測値を照合するための台帳
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = check_user_id
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS cashbox_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN ('cash_order', 'cash_charge', 'cash_settlement', 'manual_in', 'manual_out')
  ),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  charge_request_id UUID REFERENCES charge_requests(id) ON DELETE SET NULL,
  settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashbox_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actual_amount INTEGER NOT NULL CHECK (actual_amount >= 0),
  expected_amount INTEGER NOT NULL,
  difference_amount INTEGER NOT NULL,
  note TEXT,
  counted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_entries_order_unique
  ON cashbox_entries(order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_entries_charge_request_unique
  ON cashbox_entries(charge_request_id)
  WHERE charge_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_entries_settlement_unique
  ON cashbox_entries(settlement_id)
  WHERE settlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cashbox_entries_created_at
  ON cashbox_entries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cashbox_counts_counted_at
  ON cashbox_counts(counted_at DESC);

ALTER TABLE cashbox_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashbox_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_cashbox_entries" ON cashbox_entries;
DROP POLICY IF EXISTS "admin_all_cashbox_counts" ON cashbox_counts;

CREATE POLICY "admin_all_cashbox_entries"
ON cashbox_entries
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin_all_cashbox_counts"
ON cashbox_counts
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
