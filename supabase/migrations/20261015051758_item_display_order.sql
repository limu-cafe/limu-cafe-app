BEGIN;

CREATE TABLE public.item_display_order (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  item_ids uuid[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO public.item_display_order (singleton) VALUES (true);
ALTER TABLE public.item_display_order ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_display_order FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.item_display_order TO service_role;

-- Invoked only by the verified management API, using the server-only service role.
-- Both order and audit entry commit together, or neither is kept.
CREATE FUNCTION public.save_item_display_order(
  p_item_ids uuid[], p_expected_revision integer, p_actor_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  current_revision integer;
  next_revision integer;
BEGIN
  IF p_item_ids IS NULL OR p_actor_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR array_position(p_item_ids, NULL) IS NOT NULL
    OR cardinality(p_item_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_item_ids) AS ids(id)) THEN
    RAISE EXCEPTION 'Invalid item order' USING ERRCODE = '22023';
  END IF;

  -- Prevent catalog additions/deletions between snapshot validation and commit.
  LOCK TABLE public.items IN SHARE MODE;
  SELECT revision INTO current_revision FROM public.item_display_order WHERE singleton FOR UPDATE;
  IF current_revision IS NULL OR current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Display order changed' USING ERRCODE = '40001';
  END IF;
  IF cardinality(p_item_ids) <> (SELECT count(*) FROM public.items)
    OR EXISTS (SELECT 1 FROM unnest(p_item_ids) AS ids(id) LEFT JOIN public.items i ON i.id = ids.id WHERE i.id IS NULL) THEN
    RAISE EXCEPTION 'Catalog changed' USING ERRCODE = '40001';
  END IF;

  UPDATE public.item_display_order SET item_ids = p_item_ids, revision = revision + 1
    WHERE singleton RETURNING revision INTO next_revision;
  INSERT INTO public.admin_audit_logs (actor_id, action_type, target_type, summary, metadata)
    VALUES (p_actor_id, 'item_display_order_updated', 'item_display_order', '商品表示順を更新しました',
      jsonb_build_object('item_ids', p_item_ids, 'revision', next_revision));
  RETURN next_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.save_item_display_order(uuid[], integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_item_display_order(uuid[], integer, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
