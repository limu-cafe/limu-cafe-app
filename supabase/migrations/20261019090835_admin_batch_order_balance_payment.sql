-- Add only a batch receipt. Existing financial rows are not rewritten.
create table public.admin_order_balance_batches (
  id uuid primary key,
  user_id uuid not null references public.users(id),
  actor_id uuid not null references public.users(id),
  orders jsonb not null,
  expected_balance integer not null check (expected_balance>=0),
  amount integer not null check (amount>0),
  balance_after integer not null check (balance_after>=0),
  reason text not null check (length(btrim(reason)) between 1 and 300),
  created_at timestamptz not null default now(),
  check (expected_balance-amount=balance_after)
);
create index admin_order_balance_batches_user on public.admin_order_balance_batches(user_id,created_at desc);
create index admin_order_balance_batches_actor on public.admin_order_balance_batches(actor_id,created_at desc);
alter table public.admin_order_balance_batches enable row level security;
revoke all on public.admin_order_balance_batches from public,anon,authenticated,service_role;
grant select,insert on public.admin_order_balance_batches to service_role;

create function public.admin_pay_orders_from_balance(p_operation_id uuid,p_user_id uuid,p_orders jsonb,p_expected_balance integer,p_actor_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  receipt public.admin_order_balance_batches%rowtype;
  u public.users%rowtype; o public.orders%rowtype;
  normalized jsonb; entry jsonb; remaining integer; total bigint:=0;
  result jsonb; n integer;
begin
  if p_operation_id is null or p_user_id is null or p_actor_id is null or p_expected_balance is null or p_expected_balance<0
     or p_reason is null or length(btrim(p_reason)) not between 1 and 300 or jsonb_typeof(p_orders) is distinct from 'array' then
    raise exception using errcode='22023',message='精算内容を確認してください';
  end if;
  n:=jsonb_array_length(p_orders);
  if n<1 or n>1000 then raise exception using errcode='22023',message='1〜1000件の注文を選択してください'; end if;
  if exists(select 1 from jsonb_array_elements(p_orders) e where jsonb_typeof(e) is distinct from 'object'
    or coalesce(e->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(e->'expected_amount') is distinct from 'number'
    or coalesce(e->>'expected_amount','') !~ '^[1-9][0-9]{0,9}$') then
    raise exception using errcode='22023',message='選択した注文の金額を確認してください';
  end if;
  if exists(select 1 from jsonb_array_elements(p_orders) e where (e->>'expected_amount')::bigint>2147483647)
    or (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_orders) e)<>n then
    raise exception using errcode='22023',message='同じ注文の重複または不正な金額があります';
  end if;
  select jsonb_agg(jsonb_build_object('id',(e->>'id')::uuid,'expected_amount',(e->>'expected_amount')::integer) order by (e->>'id')::uuid),
    sum((e->>'expected_amount')::bigint) into normalized,total from jsonb_array_elements(p_orders) e;
  if total>2147483647 then raise exception using errcode='22023',message='精算額が大きすぎます'; end if;

  -- All collection paths already use this order -> charge -> user lock order.
  perform public.lock_user_collection_context(p_user_id);
  select * into receipt from public.admin_order_balance_batches where id=p_operation_id;
  if found then
    if receipt.user_id is distinct from p_user_id or receipt.actor_id is distinct from p_actor_id
      or receipt.orders is distinct from normalized or receipt.expected_balance is distinct from p_expected_balance
      or receipt.reason is distinct from btrim(p_reason) then
      raise exception using errcode='P0001',message='同じ操作番号の内容が変わっています。再読み込みしてください';
    end if;
    return jsonb_build_object('ok',true,'already_paid',true,'operation_id',receipt.id,'count',n,'amount',receipt.amount,'balance',receipt.balance_after);
  end if;
  select * into u from public.users where id=p_user_id;
  if u.balance<>p_expected_balance then raise exception using errcode='P0001',message='残高が更新されています。再読み込みして確認してください'; end if;
  if u.balance<total then raise exception using errcode='22023',message='残高が不足しています'; end if;
  -- Never silently skip an order already paid by another batch or individual action.
  for entry in select value from jsonb_array_elements(normalized) loop
    select * into o from public.orders where id=(entry->>'id')::uuid and user_id=p_user_id;
    if not found then raise exception using errcode='P0002',message='選択した利用者の注文が見つかりません'; end if;
    if exists(select 1 from public.order_balance_payments where order_id=o.id) then
      raise exception using errcode='P0001',message='選択した注文に残高精算済みの注文があります。再読み込みしてください';
    end if;
  end loop;
  remaining:=u.balance;
  for entry in select value from jsonb_array_elements(normalized) loop
    result:=public.admin_pay_order_from_balance((entry->>'id')::uuid,(entry->>'expected_amount')::integer,remaining,p_actor_id,btrim(p_reason));
    remaining:=(result->>'balance')::integer;
  end loop;
  insert into public.admin_order_balance_batches(id,user_id,actor_id,orders,expected_balance,amount,balance_after,reason)
  values(p_operation_id,p_user_id,p_actor_id,normalized,p_expected_balance,total::integer,remaining,btrim(p_reason));
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
  values(p_actor_id,'admin_orders_paid_from_balance','user',p_user_id::text,'管理者が選択した注文をまとめて残高精算しました',
    jsonb_build_object('operation_id',p_operation_id,'orders',normalized,'count',n,'amount',total,'balance_before',p_expected_balance,'balance_after',remaining,'reason',btrim(p_reason)));
  return jsonb_build_object('ok',true,'already_paid',false,'operation_id',p_operation_id,'count',n,'amount',total,'balance',remaining);
end;
$$;
revoke all on function public.admin_pay_orders_from_balance(uuid,uuid,jsonb,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_pay_orders_from_balance(uuid,uuid,jsonb,integer,uuid,text) to service_role;
