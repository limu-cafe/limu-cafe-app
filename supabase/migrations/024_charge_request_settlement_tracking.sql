ALTER TABLE public.charge_requests
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

ALTER TABLE public.charge_requests
  ADD COLUMN IF NOT EXISTS settlement_source text;

ALTER TABLE public.charge_requests
  ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.settlements(id) ON DELETE SET NULL;

ALTER TABLE public.charge_requests
  DROP CONSTRAINT IF EXISTS charge_requests_settlement_source_check;

ALTER TABLE public.charge_requests
  ADD CONSTRAINT charge_requests_settlement_source_check
  CHECK (
    settlement_source IS NULL
    OR settlement_source IN ('individual_cash_charge', 'deferred_settlement')
  );

CREATE INDEX IF NOT EXISTS idx_charge_requests_settlement_id
  ON public.charge_requests(settlement_id)
  WHERE settlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_charge_requests_cash_unsettled
  ON public.charge_requests(user_id, approved_at)
  WHERE method = 'cash' AND status = 'approved' AND settled_at IS NULL;

WITH charge_cash_entries AS (
  SELECT
    ce.charge_request_id,
    MIN(ce.created_at) AS settled_at
  FROM public.cashbox_entries ce
  WHERE ce.charge_request_id IS NOT NULL
  GROUP BY ce.charge_request_id
)
UPDATE public.charge_requests c
SET
  settled_at = COALESCE(c.settled_at, e.settled_at),
  settlement_source = COALESCE(c.settlement_source, 'individual_cash_charge'),
  settlement_id = NULL
FROM charge_cash_entries e
WHERE c.id = e.charge_request_id
  AND c.method = 'cash'
  AND c.status = 'approved';

WITH ranked_settlements AS (
  SELECT
    c.id AS charge_id,
    s.id AS settlement_id,
    COALESCE(s.settled_at, s.created_at) AS settlement_at,
    ROW_NUMBER() OVER (
      PARTITION BY c.id
      ORDER BY COALESCE(s.settled_at, s.created_at) ASC
    ) AS rn
  FROM public.charge_requests c
  JOIN public.settlements s
    ON s.user_id = c.user_id
   AND s.status = 'completed'
   AND COALESCE(s.settled_at, s.created_at) >= COALESCE(c.approved_at, c.created_at)
  WHERE c.method = 'cash'
    AND c.status = 'approved'
    AND c.settled_at IS NULL
)
UPDATE public.charge_requests c
SET
  settled_at = rs.settlement_at,
  settlement_source = 'deferred_settlement',
  settlement_id = rs.settlement_id
FROM ranked_settlements rs
WHERE c.id = rs.charge_id
  AND rs.rn = 1;
