-- ============================================================
-- 金庫管理バックフィル
-- 現システムに残っている過去の現金イベントを cashbox_entries に復元
-- 再実行しても重複しないように設計
-- ============================================================

CREATE TABLE IF NOT EXISTS cashbox_backfill_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'system_history',
  inserted_orders INTEGER NOT NULL DEFAULT 0,
  inserted_charges INTEGER NOT NULL DEFAULT 0,
  inserted_settlements INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashbox_backfill_runs_ran_at
  ON cashbox_backfill_runs(ran_at DESC);

ALTER TABLE cashbox_backfill_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_cashbox_backfill_runs" ON cashbox_backfill_runs;

CREATE POLICY "admin_all_cashbox_backfill_runs"
ON cashbox_backfill_runs
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

WITH inserted_orders AS (
  INSERT INTO cashbox_entries (
    entry_type,
    direction,
    amount,
    note,
    order_id,
    created_by,
    created_at
  )
  SELECT
    'cash_order',
    'in',
    o.total_amount,
    '導入前の現金注文をバックフィル',
    o.id,
    o.cash_confirmed_by,
    COALESCE(o.cash_confirmed_at, o.updated_at, o.created_at)
  FROM orders o
  LEFT JOIN cashbox_entries ce
    ON ce.order_id = o.id
  WHERE o.payment_method = 'cash'
    AND o.payment_status = 'completed'
    AND ce.id IS NULL
  RETURNING id
),
inserted_charges AS (
  INSERT INTO cashbox_entries (
    entry_type,
    direction,
    amount,
    note,
    charge_request_id,
    created_by,
    created_at
  )
  SELECT
    'cash_charge',
    'in',
    c.amount,
    '導入前の現金チャージ承認をバックフィル',
    c.id,
    c.approved_by,
    COALESCE(c.approved_at, c.updated_at, c.created_at)
  FROM charge_requests c
  LEFT JOIN cashbox_entries ce
    ON ce.charge_request_id = c.id
  WHERE c.method = 'cash'
    AND c.status = 'approved'
    AND ce.id IS NULL
  RETURNING id
),
inserted_settlements AS (
  INSERT INTO cashbox_entries (
    entry_type,
    direction,
    amount,
    note,
    settlement_id,
    created_by,
    created_at
  )
  SELECT
    'cash_settlement',
    'in',
    s.amount,
    '導入前の現金精算をバックフィル',
    s.id,
    s.settled_by,
    COALESCE(s.settled_at, s.created_at)
  FROM settlements s
  LEFT JOIN cashbox_entries ce
    ON ce.settlement_id = s.id
  WHERE s.method = 'cash'
    AND s.status = 'completed'
    AND ce.id IS NULL
  RETURNING id
)
INSERT INTO cashbox_backfill_runs (
  source,
  inserted_orders,
  inserted_charges,
  inserted_settlements,
  note
)
SELECT
  'system_history',
  (SELECT COUNT(*) FROM inserted_orders),
  (SELECT COUNT(*) FROM inserted_charges),
  (SELECT COUNT(*) FROM inserted_settlements),
  '現システム内の過去現金履歴を cashbox_entries に復元';
