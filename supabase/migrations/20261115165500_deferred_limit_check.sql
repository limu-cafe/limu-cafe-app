BEGIN;

-- The ceiling for users.deferred_balance (unsettled top-ups plus deferred orders), in yen.
-- This is the only place the number lives: change it with CREATE OR REPLACE in a new migration.
CREATE FUNCTION public.deferred_balance_limit()
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT 10000;
$$;

-- Raises LM001 when deferred_balance + p_amount would exceed the ceiling; writes nothing.
-- Call it inside the same database function (transaction) that later increases
-- deferred_balance: the row locks taken here are what keep two concurrent requests
-- from both passing. Returns the allowance left after p_amount is added.
CREATE FUNCTION public.check_deferred_limit(p_user_id uuid, p_amount integer)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_limit integer := public.deferred_balance_limit();
  v_current integer;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = '金額が不正です';
  END IF;
  -- Same orders -> charge_requests -> users lock order as every other wallet RPC.
  -- Raises P0002 when the user does not exist.
  PERFORM public.lock_user_collection_context(p_user_id);
  SELECT deferred_balance INTO v_current FROM public.users WHERE id = p_user_id;
  IF v_current::bigint + p_amount > v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'LM001',
      MESSAGE = '後払いの上限（' || to_char(v_limit, 'FM999,999,999,999') || '円）を超えるため受け付けできません',
      DETAIL = jsonb_build_object('limit', v_limit, 'current', v_current, 'requested', p_amount,
        'remaining', greatest(v_limit - v_current, 0))::text;
  END IF;
  RETURN v_limit - v_current - p_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.deferred_balance_limit(), public.check_deferred_limit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deferred_balance_limit(), public.check_deferred_limit(uuid, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
