begin;

-- One request ID owns the entire order/stock/wallet/point transaction.
-- A failed checkout rolls its row back, so the same ID can be sent again.
create table public.checkout_operations (
  request_id uuid primary key,
  payload jsonb not null,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.checkout_operations enable row level security;
revoke all on public.checkout_operations from public, anon, authenticated;
grant select, insert, update on public.checkout_operations to service_role;

-- Adding a parameter creates a second overload, so the old signature is removed first.
drop function public.checkout_order(uuid,jsonb,integer,text,text,integer);

-- A single transaction owns product prices, stock and all wallet/point changes.
-- Older API clients may send price/name/subtotal fields; they are never used.
-- p_request_id is optional only so that an application version deployed before this
-- migration keeps working; the current API always sends it.
create function public.checkout_order(
  p_user_id uuid, p_items jsonb, p_expected_total integer,
  p_payment_method text, p_deferred_method text, p_requested_points integer,
  p_request_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  u public.users%rowtype; i public.items%rowtype; line record;
  total bigint := 0; points integer; due integer; method text; oid uuid;
  canonical jsonb := '[]'; low_stock jsonb := '[]'; count_items integer;
  v_payload jsonb; existing public.checkout_operations%rowtype; v_result jsonb;
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

  -- Same steps as record_stock_restock: register the ID, lock its row, compare the
  -- payload, and return the stored result when the first attempt already committed.
  -- A concurrent duplicate waits on the primary key until the first attempt ends.
  if p_request_id is not null then
    v_payload := jsonb_build_object('user_id',p_user_id,
      'items',(select jsonb_agg(jsonb_build_object('item_id',(x->>'item_id')::uuid,'quantity',(x->>'quantity')::integer) order by (x->>'item_id')::uuid) from jsonb_array_elements(p_items) x),
      'expected_total',p_expected_total,'payment_method',p_payment_method,
      'deferred_method',case when p_payment_method='deferred' then p_deferred_method else null end,
      'requested_points',p_requested_points);
    insert into public.checkout_operations(request_id,payload) values(p_request_id,v_payload)
      on conflict (request_id) do nothing;
    select * into existing from public.checkout_operations where request_id=p_request_id for update;
    if existing.payload is distinct from v_payload then
      raise exception using errcode='22023',message='同じ操作IDで内容を変更できません';
    end if;
    if existing.result is not null then return existing.result || jsonb_build_object('replayed',true); end if;
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
  -- Only the amount that is actually added to the unsettled debt counts against the
  -- ceiling. Balance, cash and points-only orders are never limited. Raises LM001.
  if method='deferred' and due>0 then perform public.check_deferred_limit(p_user_id,due); end if;

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
  v_result := jsonb_build_object('ok',true,'order_id',oid,'total_amount',total,'points_used',points,'payment_method',method,'user_name',u.name,'items',canonical,'low_stock_items',low_stock);
  if p_request_id is not null then
    update public.checkout_operations set result=v_result where request_id=p_request_id;
  end if;
  return v_result;
end;
$$;
revoke all on function public.checkout_order(uuid,jsonb,integer,text,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.checkout_order(uuid,jsonb,integer,text,text,integer,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
