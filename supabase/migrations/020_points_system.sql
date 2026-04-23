ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS points_used INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.point_settings (
  singleton TEXT PRIMARY KEY DEFAULT 'default' CHECK (singleton = 'default'),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  base_points_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (base_points_per_unit > 0),
  yen_per_point_unit INTEGER NOT NULL DEFAULT 100 CHECK (yen_per_point_unit > 0),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.point_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  multiplier NUMERIC(10,2) NOT NULL CHECK (multiplier > 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  apply_immediately BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.point_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason_type TEXT NOT NULL CHECK (
    reason_type IN (
      'charge_reward',
      'manual_grant',
      'manual_deduct',
      'order_use',
      'order_refund',
      'charge_refund_reversal'
    )
  ),
  charge_request_id UUID REFERENCES public.charge_requests(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_created
  ON public.point_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_transactions_charge_request_id
  ON public.point_transactions(charge_request_id);

CREATE INDEX IF NOT EXISTS idx_point_transactions_order_id
  ON public.point_transactions(order_id);

CREATE TRIGGER point_settings_updated_at
BEFORE UPDATE ON public.point_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER point_campaigns_updated_at
BEFORE UPDATE ON public.point_campaigns
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO public.point_settings (
  singleton,
  is_enabled,
  base_points_per_unit,
  yen_per_point_unit
)
VALUES (
  'default',
  true,
  1,
  100
)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "point_transactions_select_own" ON public.point_transactions;
CREATE POLICY "point_transactions_select_own"
ON public.point_transactions
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_all_point_transactions" ON public.point_transactions;
CREATE POLICY "admin_all_point_transactions"
ON public.point_transactions
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.point_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_point_settings" ON public.point_settings;
CREATE POLICY "admin_all_point_settings"
ON public.point_settings
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.point_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_point_campaigns" ON public.point_campaigns;
CREATE POLICY "admin_all_point_campaigns"
ON public.point_campaigns
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.active_point_multiplier(
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS NUMERIC AS $$
DECLARE
  v_multiplier NUMERIC(10,2);
BEGIN
  SELECT MAX(multiplier)
  INTO v_multiplier
  FROM public.point_campaigns
  WHERE is_enabled = true
    AND (
      apply_immediately = true
      OR (
        starts_at IS NOT NULL
        AND starts_at <= p_now
        AND (ends_at IS NULL OR ends_at >= p_now)
      )
    );

  RETURN COALESCE(v_multiplier, 1);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.calculate_charge_reward_points(
  p_amount INTEGER,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS INTEGER AS $$
DECLARE
  v_settings RECORD;
  v_multiplier NUMERIC(10,2);
BEGIN
  SELECT is_enabled, base_points_per_unit, yen_per_point_unit
  INTO v_settings
  FROM public.point_settings
  WHERE singleton = 'default';

  IF NOT FOUND OR v_settings.is_enabled = false OR p_amount <= 0 THEN
    RETURN 0;
  END IF;

  v_multiplier := public.active_point_multiplier(p_now);

  RETURN FLOOR(
    (p_amount::NUMERIC / v_settings.yen_per_point_unit::NUMERIC)
    * v_settings.base_points_per_unit::NUMERIC
    * v_multiplier
  )::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.record_point_transaction(
  p_user_id UUID,
  p_delta INTEGER,
  p_reason_type TEXT,
  p_charge_request_id UUID DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_user RECORD;
  v_new_balance INTEGER;
BEGIN
  IF p_delta = 0 THEN
    SELECT points_balance
    INTO v_user
    FROM public.users
    WHERE id = p_user_id;

    RETURN COALESCE(v_user.points_balance, 0);
  END IF;

  SELECT id, points_balance
  INTO v_user
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ポイント対象ユーザーが見つかりません';
  END IF;

  v_new_balance := v_user.points_balance + p_delta;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'ポイント残高が不足しています';
  END IF;

  UPDATE public.users
  SET points_balance = v_new_balance
  WHERE id = p_user_id;

  INSERT INTO public.point_transactions (
    user_id,
    delta,
    balance_after,
    reason_type,
    charge_request_id,
    order_id,
    note,
    created_by
  )
  VALUES (
    p_user_id,
    p_delta,
    v_new_balance,
    p_reason_type,
    p_charge_request_id,
    p_order_id,
    p_note,
    p_created_by
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.approve_pending_charge_request(
  p_charge_request_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_request RECORD;
  v_reward_points INTEGER;
BEGIN
  SELECT *
  INTO v_request
  FROM public.charge_requests
  WHERE id = p_charge_request_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '申請が見つかりません';
  END IF;

  UPDATE public.charge_requests
  SET
    status = 'approved',
    approved_at = NOW(),
    approved_by = p_actor_id
  WHERE id = p_charge_request_id;

  UPDATE public.users
  SET balance = balance + v_request.amount
  WHERE id = v_request.user_id;

  IF v_request.method = 'cash' THEN
    INSERT INTO public.cashbox_entries (
      entry_type,
      direction,
      amount,
      note,
      charge_request_id,
      created_by
    )
    VALUES (
      'cash_charge',
      'in',
      v_request.amount,
      '現金チャージ申請の承認',
      p_charge_request_id,
      p_actor_id
    );
  END IF;

  v_reward_points := public.calculate_charge_reward_points(v_request.amount);

  IF v_reward_points > 0 THEN
    PERFORM public.record_point_transaction(
      v_request.user_id,
      v_reward_points,
      'charge_reward',
      p_charge_request_id,
      NULL,
      CONCAT('チャージ特典 ', v_reward_points::TEXT, 'pt'),
      p_actor_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.refund_charge_request(
  p_charge_request_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_request RECORD;
  v_note TEXT;
  v_reward_points INTEGER;
BEGIN
  SELECT id, user_id, amount, method, status, note
  INTO v_request
  FROM public.charge_requests
  WHERE id = p_charge_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'チャージ記録が見つかりません';
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION '反映済みのチャージだけ返金できます';
  END IF;

  UPDATE public.users
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
    INSERT INTO public.cashbox_entries (
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
      CONCAT('チャージ返金: ', p_charge_request_id::TEXT),
      p_actor_id
    );
  END IF;

  SELECT COALESCE(SUM(delta), 0)
  INTO v_reward_points
  FROM public.point_transactions
  WHERE charge_request_id = p_charge_request_id
    AND reason_type = 'charge_reward';

  IF v_reward_points > 0 THEN
    PERFORM public.record_point_transaction(
      v_request.user_id,
      -v_reward_points,
      'charge_refund_reversal',
      p_charge_request_id,
      NULL,
      CONCAT('チャージ返金によるポイント取消 ', v_reward_points::TEXT, 'pt'),
      p_actor_id
    );
  END IF;

  v_note := CASE
    WHEN v_request.note IS NULL OR v_request.note = '' THEN '返金処理済み'
    ELSE v_request.note || E'\n返金処理済み'
  END;

  UPDATE public.charge_requests
  SET
    status = 'refunded',
    note = v_note,
    updated_at = NOW()
  WHERE id = p_charge_request_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.refund_order(
  p_order_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  SELECT id, user_id, total_amount, payment_method, payment_status, points_used
  INTO v_order
  FROM public.orders
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
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE public.items
    SET stock = stock + v_item.quantity
    WHERE id = v_item.item_id;

    INSERT INTO public.stock_history (
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
    UPDATE public.users
    SET balance = balance + (v_order.total_amount - COALESCE(v_order.points_used, 0))
    WHERE id = v_order.user_id;
  ELSIF v_order.payment_method = 'deferred' THEN
    UPDATE public.users
    SET deferred_balance = deferred_balance - (v_order.total_amount - COALESCE(v_order.points_used, 0))
    WHERE id = v_order.user_id
      AND deferred_balance >= (v_order.total_amount - COALESCE(v_order.points_used, 0));

    IF NOT FOUND THEN
      RAISE EXCEPTION '後払い残高を戻せませんでした';
    END IF;
  ELSIF v_order.payment_method = 'cash' AND v_order.payment_status = 'completed' THEN
    INSERT INTO public.cashbox_entries (
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
      CONCAT('注文返金: ', p_order_id::TEXT),
      p_actor_id
    );
  END IF;

  IF COALESCE(v_order.points_used, 0) > 0 THEN
    PERFORM public.record_point_transaction(
      v_order.user_id,
      v_order.points_used,
      'order_refund',
      NULL,
      p_order_id,
      CONCAT('注文返金によるポイント返却 ', v_order.points_used::TEXT, 'pt'),
      p_actor_id
    );
  END IF;

  UPDATE public.orders
  SET payment_status = 'refunded'
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.cancel_non_card_order(
  p_order_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  SELECT id, user_id, total_amount, payment_method, payment_status, points_used
  INTO v_order
  FROM public.orders
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
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE public.items
    SET stock = stock + v_item.quantity
    WHERE id = v_item.item_id;

    INSERT INTO public.stock_history (
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
    UPDATE public.users
    SET balance = balance + (v_order.total_amount - COALESCE(v_order.points_used, 0))
    WHERE id = v_order.user_id;
  ELSIF v_order.payment_method = 'deferred' THEN
    UPDATE public.users
    SET deferred_balance = deferred_balance - (v_order.total_amount - COALESCE(v_order.points_used, 0))
    WHERE id = v_order.user_id
      AND deferred_balance >= (v_order.total_amount - COALESCE(v_order.points_used, 0));

    IF NOT FOUND THEN
      RAISE EXCEPTION '後払い残高を戻せませんでした';
    END IF;
  END IF;

  IF COALESCE(v_order.points_used, 0) > 0 THEN
    PERFORM public.record_point_transaction(
      v_order.user_id,
      v_order.points_used,
      'order_refund',
      NULL,
      p_order_id,
      CONCAT('注文キャンセルによるポイント返却 ', v_order.points_used::TEXT, 'pt'),
      p_actor_id
    );
  END IF;

  UPDATE public.orders
  SET payment_status = 'cancelled'
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;
