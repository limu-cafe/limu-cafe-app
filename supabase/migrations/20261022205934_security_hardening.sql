-- Financial writes are performed by authenticated server APIs using service_role.
-- Preserve client reads and social-board writes; close direct financial writes,
-- including UPDATE through RPCs and column grants left by older deployments.
do $$
declare t text; cols text; f record;
begin
  foreach t in array array['users','categories','items','orders','order_items','charge_requests',
    'settlements','stock_history','price_watches','settlement_reminder_settings','cashbox_entries',
    'cashbox_counts','legacy_users','legacy_purchase_history','legacy_transfer_requests','admin_audit_logs',
    'purchase_runs','purchase_run_items','point_transactions','point_settings','point_campaigns',
    'subscription_products','user_subscriptions','subscription_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon, authenticated',t);
    select string_agg(quote_ident(attname),',') into cols from pg_attribute
      where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',cols,cols,cols,t);
  end loop;
  -- These tables have always been read through server-only management clients.
  foreach t in array array['settlements','price_watches','settlement_reminder_settings'] loop
    execute format('revoke all on public.%I from public, anon, authenticated',t);
  end loop;
  -- Existing RLS uses is_admin. All other application RPCs are server-only.
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname in (
      'active_point_multiplier','calculate_charge_reward_points','record_point_transaction',
      'approve_pending_charge_request','decrement_stock','update_updated_at',
      'decrement_user_balance_if_available','increment_user_deferred_balance',
      'apply_immediate_charge_to_deferred','refund_order','cancel_non_card_order','refund_charge_request') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
    execute format('alter function %s set search_path = public, pg_temp',f.signature);
  end loop;
end $$;

-- Prevent object shadowing in the fixed search path of legacy application RPCs.
revoke create on schema public from public, anon, authenticated;
-- RLS may ask about the current user only; never expose another user's role.
create or replace function public.is_admin(check_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select check_user_id = auth.uid() and exists (
    select 1 from public.users where id=check_user_id and role='admin' and is_active and is_approved
  );
$$;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- A single transaction owns product prices, stock and all wallet/point changes.
-- Older API clients may send price/name/subtotal fields; they are never used.
create function public.checkout_order(
  p_user_id uuid, p_items jsonb, p_expected_total integer,
  p_payment_method text, p_deferred_method text, p_requested_points integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  u public.users%rowtype; i public.items%rowtype; line record;
  total bigint := 0; points integer; due integer; method text; oid uuid;
  canonical jsonb := '[]'; low_stock jsonb := '[]'; count_items integer;
begin
  if p_user_id is null or p_expected_total is null or p_expected_total<0
    or p_requested_points is null or p_requested_points<0
    or p_payment_method is null or p_payment_method not in ('balance','deferred','cash')
    or (p_payment_method='deferred' and (p_deferred_method is null or p_deferred_method not in ('cash','stripe')))
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode='22023',message='注文内容が不正です';
  end if;
  count_items := jsonb_array_length(p_items);
  if count_items not between 1 and 100 then raise exception using errcode='22023',message='商品数が不正です'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'object'
    or jsonb_typeof(x->'quantity') is distinct from 'number' or not (x->>'quantity' ~ '^[1-9][0-9]*$')
    or (x->>'quantity')::numeric>2147483647
    or coalesce(x->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception using errcode='22023',message='商品・個数が不正です';
  end if;
  if (select count(distinct (x->>'item_id')::uuid) from jsonb_array_elements(p_items) x)<>count_items then
    raise exception using errcode='22023',message='同じ商品が重複しています';
  end if;
  perform public.lock_user_collection_context(p_user_id);
  select * into u from public.users where id=p_user_id;
  if not u.is_active or not u.is_approved then raise exception using errcode='42501',message='このアカウントでは注文できません'; end if;

  -- Stable lock order for carts that contain overlapping products.
  for line in select (x->>'item_id')::uuid as id,(x->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) x order by (x->>'item_id')::uuid loop
    select * into i from public.items where id=line.id for no key update;
    if not found or not i.is_available then raise exception using errcode='P0001',message='販売していない商品があります。カートを更新してください'; end if;
    if i.price<0 or (not i.is_unlimited_stock and i.stock<line.quantity) then
      raise exception using errcode='P0001',message='在庫が不足しています。カートを更新してください';
    end if;
    total := total + i.price::bigint*line.quantity;
    if total>2147483647 then raise exception using errcode='22023',message='注文金額が大きすぎます'; end if;
    canonical := canonical || jsonb_build_array(jsonb_build_object('item_id',i.id,'item_name',i.name,'item_price',i.price,'quantity',line.quantity,'subtotal',i.price::bigint*line.quantity));
  end loop;
  if total<>p_expected_total then raise exception using errcode='P0001',message='商品価格が更新されています。カートを更新して金額を確認してください'; end if;
  points := least(p_requested_points,greatest(u.points_balance,0),total::integer);
  due := total::integer-points;
  method := case when due=0 then 'balance' else p_payment_method end;
  if method='balance' and u.balance<due then raise exception using errcode='P0001',message='残高が不足しています'; end if;

  insert into public.orders(user_id,total_amount,points_used,payment_method,payment_status,deferred_settlement_method,accounting_ready)
    values(p_user_id,total,points,method,case when method='cash' then 'pending' else 'completed' end,
      case when method='deferred' then p_deferred_method else null end,true) returning id into oid;
  insert into public.order_items(order_id,item_id,item_name,item_price,quantity,subtotal)
    select oid,r.item_id,r.item_name,r.item_price,r.quantity,r.subtotal
      from jsonb_to_recordset(canonical) as r(item_id uuid,item_name text,item_price integer,quantity integer,subtotal integer);
  for line in select * from jsonb_to_recordset(canonical) as r(item_id uuid,quantity integer) loop
    select * into i from public.items where id=line.item_id;
    if not i.is_unlimited_stock then
      update public.items set stock=stock-line.quantity where id=i.id returning * into i;
      insert into public.stock_history(item_id,change_amount,reason,order_id,created_by) values(i.id,-line.quantity,'purchase',oid,p_user_id);
      if i.stock<=i.stock_alert_threshold then
        low_stock := low_stock || jsonb_build_array(jsonb_build_object('name',i.name,'stock',i.stock,'stock_alert_threshold',i.stock_alert_threshold));
      end if;
    end if;
  end loop;
  if points>0 then
    perform public.record_point_transaction(p_user_id,-points,'order_use',null,oid,'注文でポイント利用 '||points||'pt',p_user_id,null);
  end if;
  if method='balance' and due>0 then
    perform public.decrement_user_balance_if_available(p_user_id,due);
  elsif method='deferred' and due>0 then
    perform public.increment_user_deferred_balance(p_user_id,due);
  end if;
  return jsonb_build_object('ok',true,'order_id',oid,'total_amount',total,'points_used',points,'payment_method',method,'user_name',u.name,'items',canonical,'low_stock_items',low_stock);
end;
$$;
revoke all on function public.checkout_order(uuid,jsonb,integer,text,text,integer) from public, anon, authenticated;
grant execute on function public.checkout_order(uuid,jsonb,integer,text,text,integer) to service_role;
