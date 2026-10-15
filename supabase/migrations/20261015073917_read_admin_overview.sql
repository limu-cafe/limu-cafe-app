-- Additive, SELECT-only summary. Existing records and accounting rules are unchanged.
CREATE OR REPLACE FUNCTION public.read_admin_overview(p_workspace_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
SELECT jsonb_build_object(
  'deferredOrders', (SELECT count(*) FROM public.orders WHERE payment_method = 'deferred' AND payment_status = 'completed' AND (deferred_settlement_method IS NULL OR deferred_settlement_method = 'cash') AND settled_at IS NULL),
  'cashOrders', (SELECT count(*) FROM public.orders WHERE payment_method = 'cash' AND payment_status = 'pending'),
  'pendingCharges', (SELECT count(*) FROM public.charge_requests WHERE status = 'pending'),
  'cashCharges', (SELECT count(*) FROM public.charge_requests WHERE method = 'cash' AND status = 'approved' AND settled_at IS NULL),
  'subscriptionPayments', (SELECT count(*) FROM public.subscription_payments WHERE payment_status = 'pending_cash_settlement'),
  'reimbursements', (SELECT count(*) FROM public.purchase_runs WHERE reimbursement_status = 'pending_reimbursement'),
  'users', (SELECT count(*) FROM public.users WHERE is_approved = false AND is_active = true),
  'requests', (SELECT count(*) FROM public.item_requests WHERE status = 'pending'),
  'legacy', (SELECT count(*) FROM public.legacy_transfer_requests WHERE status = 'pending'),
  'activeSubscriptions', (SELECT count(*) FROM public.user_subscriptions WHERE status IN ('active', 'cancel_at_period_end')),
  'inventory', COALESCE((SELECT jsonb_agg(jsonb_build_object('stock', stock, 'stock_alert_threshold', stock_alert_threshold, 'is_available', is_available, 'is_unlimited_stock', is_unlimited_stock)) FROM public.items WHERE is_available = true), '[]'::jsonb),
  -- deferred_balance also contains legacy transfers and cash charges; do not rebuild it from orders.
  'deferredUsers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'avatar_url', avatar_url, 'deferred_balance', deferred_balance)) FROM public.users WHERE deferred_balance > 0 AND is_active = true), '[]'::jsonb),
  'pendingCashOrders', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', o.user_id, 'total_amount', o.total_amount, 'user', jsonb_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url))) FROM public.orders o LEFT JOIN public.users u ON u.id = o.user_id WHERE o.payment_method = 'cash' AND o.payment_status = 'pending'), '[]'::jsonb),
  'pendingSubscriptions', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'cash_due_amount', p.cash_due_amount, 'user', jsonb_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url))) FROM public.subscription_payments p LEFT JOIN public.users u ON u.id = p.user_id WHERE p.payment_status = 'pending_cash_settlement' AND p.cash_due_amount > 0), '[]'::jsonb),
  'botIntroUsers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name) FROM public.users WHERE is_active = true AND slack_user_id IS NOT NULL AND bot_intro_sent_at IS NULL AND (p_workspace_id IS NULL OR slack_workspace_id = p_workspace_id)), '[]'::jsonb)
);
$$;
REVOKE ALL ON FUNCTION public.read_admin_overview(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_admin_overview(text) TO service_role;
