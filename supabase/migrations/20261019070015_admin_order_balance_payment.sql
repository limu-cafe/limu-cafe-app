-- Existing rows are complete; new multi-step checkouts/charges become collectible only after finalization.
-- No historical amounts, payment methods, balances or inventory are rewritten here.
alter table public.orders add column accounting_ready boolean not null default true;
alter table public.orders alter column accounting_ready set default false;
alter table public.charge_requests add column accounting_ready boolean not null default true;
alter table public.charge_requests alter column accounting_ready set default false;

create table public.order_balance_payments (
  order_id uuid primary key references public.orders(id),
  user_id uuid not null references public.users(id),
  actor_id uuid not null references public.users(id),
  reason text not null check (length(btrim(reason)) between 1 and 300),
  amount integer not null check (amount > 0),
  original_payment_method text not null check (original_payment_method in ('cash','deferred')),
  original_deferred_method text,
  balance_before integer not null,
  balance_after integer not null check (balance_after >= 0),
  deferred_before integer not null,
  deferred_after integer not null check (deferred_after >= 0),
  created_at timestamptz not null default now(),
  check (balance_before - balance_after = amount)
);
create index order_balance_payments_user on public.order_balance_payments(user_id,created_at desc);
alter table public.order_balance_payments enable row level security;
revoke all on public.order_balance_payments from public,anon,authenticated,service_role;
grant select,insert on public.order_balance_payments to service_role;

-- A consistent order -> charge -> user lock order also coexists with existing refund RPCs.
create function public.lock_user_collection_context(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform id from public.orders where user_id=p_user_id order by id for no key update;
  perform id from public.charge_requests where user_id=p_user_id order by id for no key update;
  perform id from public.users where id=p_user_id for no key update;
  if not found then raise exception using errcode='P0002',message='利用者が見つかりません'; end if;
end;
$$;

create function public.admin_pay_order_from_balance(p_order_id uuid,p_expected_amount integer,p_expected_balance integer,p_actor_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o public.orders%rowtype; u public.users%rowtype; previous public.order_balance_payments%rowtype;
  due integer; new_deferred integer; p_user_id uuid;
begin
  if p_actor_id is null or p_order_id is null or p_expected_amount is null or p_expected_balance is null or p_reason is null or length(btrim(p_reason)) not between 1 and 300 then
    raise exception using errcode='22023',message='精算内容を確認してください';
  end if;
  -- The owner comes from the selected order, never from a browser-supplied user ID.
  select user_id into p_user_id from public.orders where id=p_order_id;
  if p_user_id is null then
    raise exception using errcode='P0002',message='対象の注文が見つかりません';
  end if;
  perform public.lock_user_collection_context(p_user_id);
  select * into o from public.orders where id=p_order_id and user_id=p_user_id;
  if not found then raise exception using errcode='P0002',message='対象の注文が見つかりません'; end if;
  select * into u from public.users where id=p_user_id;
  if not u.is_active or not u.is_approved then raise exception using errcode='42501',message='このアカウントでは精算できません'; end if;
  select * into previous from public.order_balance_payments where order_id=p_order_id;
  if found then
    if o.payment_method='balance' and o.payment_status='completed' then
      return jsonb_build_object('ok',true,'already_paid',true,'amount',previous.amount,'balance',u.balance,'deferred_balance',u.deferred_balance);
    end if;
    raise exception using errcode='P0001',message='この注文は支払後に変更されています。履歴を更新してください';
  end if;
  if not o.accounting_ready then raise exception using errcode='P0001',message='注文を処理中です。少し待って再読み込みしてください'; end if;
  if not ((o.payment_method='cash' and o.payment_status='pending') or
          (o.payment_method='deferred' and o.payment_status='completed' and coalesce(o.deferred_settlement_method,'cash')='cash'))
     or o.settled_at is not null or o.settlement_source is not null or o.settlement_id is not null
     or o.cash_confirmed_at is not null or exists(select 1 from public.cashbox_entries where order_id=o.id) then
    raise exception using errcode='P0001',message='未精算の現金払い・後払い注文だけ残高で支払えます。現金受領済みの場合は管理者に確認してください';
  end if;
  due := o.total_amount-coalesce(o.points_used,0);
  if coalesce(o.points_used,0)<0 or due<=0 or due<>p_expected_amount or u.balance<>p_expected_balance then
    raise exception using errcode='P0001',message='金額または残高が更新されています。再読み込みして確認してください';
  end if;
  if u.balance<due then raise exception using errcode='22023',message='残高が不足しています'; end if;
  new_deferred := u.deferred_balance-case when o.payment_method='deferred' then due else 0 end;
  if new_deferred<0 then raise exception using errcode='P0001',message='要回収額と注文が一致しません。管理者に確認してください'; end if;

  update public.users set balance=balance-due,deferred_balance=new_deferred where id=p_user_id;
  insert into public.order_balance_payments(order_id,user_id,actor_id,reason,amount,original_payment_method,original_deferred_method,balance_before,balance_after,deferred_before,deferred_after)
  values(o.id,p_user_id,p_actor_id,btrim(p_reason),due,o.payment_method,o.deferred_settlement_method,u.balance,u.balance-due,u.deferred_balance,new_deferred);
  -- The order records the actual payment method; the immutable record above preserves its origin.
  -- Existing balance refund/cancellation RPCs consequently return this debit to the wallet, once.
  update public.orders set payment_method='balance',payment_status='completed',deferred_settlement_method=null,
    settled_at=now(),settlement_source=null,settlement_id=null where id=o.id;
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
  values(p_actor_id,'admin_order_paid_from_balance','order',o.id::text,'管理者が未精算注文を利用者の残高から精算しました',
    jsonb_build_object('actor_type','admin','user_id',p_user_id,'reason',btrim(p_reason),'amount',due,'original_payment_method',o.payment_method,'balance_before',u.balance,'balance_after',u.balance-due,'deferred_before',u.deferred_balance,'deferred_after',new_deferred));
  return jsonb_build_object('ok',true,'already_paid',false,'amount',due,'balance',u.balance-due,'deferred_balance',new_deferred);
end;
$$;

-- Cash receipt/undo participates in the same transaction and locks as wallet settlement.
create function public.record_cash_collection(p_kind text,p_target_id uuid,p_reverse boolean,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid; o public.orders%rowtype; c public.charge_requests%rowtype; u public.users%rowtype;
  due integer; sid uuid; action_name text;
begin
  if p_actor_id is null or p_reverse is null then raise exception using errcode='22023',message='操作内容が不正です'; end if;
  if p_kind in ('cash_order','deferred_order') then select user_id into owner_id from public.orders where id=p_target_id;
  elsif p_kind='cash_charge' then select user_id into owner_id from public.charge_requests where id=p_target_id;
  else raise exception using errcode='22023',message='操作種別が不正です'; end if;
  if owner_id is null then raise exception using errcode='P0002',message='対象の記録が見つかりません'; end if;
  perform public.lock_user_collection_context(owner_id);
  select * into u from public.users where id=owner_id;
  if p_kind='cash_charge' then
    select * into c from public.charge_requests where id=p_target_id;
    if not found then raise exception using errcode='P0002',message='チャージが見つかりません'; end if;
    if not c.accounting_ready or c.method<>'cash' or c.status<>'approved' then raise exception using errcode='P0001',message='反映済みの現金チャージだけ精算できます'; end if;
    if c.settlement_source='deferred_settlement' then raise exception using errcode='P0001',message='一括精算に含まれています。一括精算から戻してください'; end if;
    due := c.amount;
    if not p_reverse then
      if c.settled_at is not null then return jsonb_build_object('ok',true,'already_done',true); end if;
      if u.deferred_balance<due or exists(select 1 from public.cashbox_entries where charge_request_id=c.id) then raise exception using errcode='P0001',message='回収記録と要回収額を確認してください'; end if;
      insert into public.cashbox_entries(entry_type,direction,amount,note,charge_request_id,created_by) values('cash_charge','in',due,'現金チャージの受領確認',c.id,p_actor_id);
      update public.charge_requests set settled_at=now(),settlement_source='individual_cash_charge',settlement_id=null where id=c.id;
      update public.users set deferred_balance=deferred_balance-due where id=owner_id;
    else
      if c.settled_at is null or c.settlement_source is distinct from 'individual_cash_charge' then raise exception using errcode='P0001',message='個別受領したチャージだけ未精算に戻せます'; end if;
      delete from public.cashbox_entries where charge_request_id=c.id;
      update public.charge_requests set settled_at=null,settlement_source=null,settlement_id=null where id=c.id;
      update public.users set deferred_balance=deferred_balance+due where id=owner_id;
    end if;
    action_name := case when p_reverse then 'cash_charge_unconfirmed' else 'cash_charge_confirmed' end;
  else
    select * into o from public.orders where id=p_target_id;
    if not found then raise exception using errcode='P0002',message='注文が見つかりません'; end if;
    if not o.accounting_ready then raise exception using errcode='P0001',message='注文を処理中です。再読み込みしてください'; end if;
    due := o.total_amount-coalesce(o.points_used,0);
    if due<=0 then raise exception using errcode='22023',message='精算額を確認してください'; end if;
    if p_kind='cash_order' then
      if o.payment_method<>'cash' or o.payment_status not in ('pending','completed') then raise exception using errcode='P0001',message='未取消の現金注文だけ操作できます'; end if;
      if not p_reverse then
        if o.payment_status='completed' then return jsonb_build_object('ok',true,'already_done',true); end if;
        if exists(select 1 from public.cashbox_entries where order_id=o.id) then raise exception using errcode='P0001',message='既存の現金受領記録を確認してください'; end if;
        insert into public.cashbox_entries(entry_type,direction,amount,note,order_id,created_by) values('cash_order','in',due,'現金払い注文の受領確認',o.id,p_actor_id);
        update public.orders set payment_status='completed',cash_confirmed_at=now(),cash_confirmed_by=p_actor_id where id=o.id;
      else
        if o.payment_status='pending' then return jsonb_build_object('ok',true,'already_done',true); end if;
        delete from public.cashbox_entries where order_id=o.id;
        update public.orders set payment_status='pending',cash_confirmed_at=null,cash_confirmed_by=null where id=o.id;
      end if;
      action_name := case when p_reverse then 'cash_order_unconfirmed' else 'cash_order_confirmed' end;
    else
      if o.payment_method<>'deferred' or coalesce(o.deferred_settlement_method,'cash')<>'cash' or o.payment_status<>'completed' then raise exception using errcode='P0001',message='現金回収する後払い注文だけ操作できます'; end if;
      if not p_reverse then
        if o.settlement_source='individual_deferred_order' and o.settled_at is not null then return jsonb_build_object('ok',true,'already_done',true); end if;
        if o.settled_at is not null or o.settlement_source is not null or o.settlement_id is not null or u.deferred_balance<due then raise exception using errcode='P0001',message='注文は精算済みか、要回収額が更新されています'; end if;
        insert into public.settlements(user_id,amount,method,period_start,period_end,status,settled_at,settled_by,note)
        values(owner_id,due,'cash',(o.created_at at time zone 'Asia/Tokyo')::date,(o.created_at at time zone 'Asia/Tokyo')::date,'completed',now(),p_actor_id,'後払い注文の個別精算') returning id into sid;
        insert into public.cashbox_entries(entry_type,direction,amount,note,settlement_id,created_by) values('cash_settlement','in',due,'後払い注文の個別精算',sid,p_actor_id);
        update public.users set deferred_balance=deferred_balance-due where id=owner_id;
        update public.orders set settled_at=now(),settlement_source='individual_deferred_order',settlement_id=sid where id=o.id;
      else
        if o.settlement_source is distinct from 'individual_deferred_order' or o.settled_at is null or o.settlement_id is null then raise exception using errcode='P0001',message='個別精算した注文だけ未精算に戻せます'; end if;
        delete from public.cashbox_entries where settlement_id=o.settlement_id;
        update public.users set deferred_balance=deferred_balance+due where id=owner_id;
        update public.settlements set status='pending',settled_at=null,settled_by=null where id=o.settlement_id;
        update public.orders set settled_at=null,settlement_source=null,settlement_id=null where id=o.id;
      end if;
      action_name := case when p_reverse then 'deferred_order_unsettled' else 'deferred_order_settled' end;
    end if;
  end if;
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
  values(p_actor_id,action_name,case when p_kind='cash_charge' then 'charge_request' else 'order' end,p_target_id::text,
    case when p_reverse then '現金受領を未精算に戻しました' else '現金の受領を確認しました' end,jsonb_build_object('amount',due,'user_id',owner_id));
  return jsonb_build_object('ok',true);
end;
$$;

create function public.complete_deferred_collection(p_user_id uuid,p_amount integer,p_method text,p_period_start date,p_period_end date,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u public.users%rowtype; sid uuid;
begin
  if p_actor_id is null or p_amount is null or p_amount<=0 or p_method not in ('cash','balance','stripe') or p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception using errcode='22023',message='精算内容が不正です'; end if;
  perform public.lock_user_collection_context(p_user_id);
  select * into u from public.users where id=p_user_id;
  if u.deferred_balance<>p_amount then raise exception using errcode='P0001',message='要回収額が更新されています。再読み込みしてください'; end if;
  if exists(select 1 from public.orders where user_id=p_user_id and payment_status in ('pending','completed') and not accounting_ready)
    or exists(select 1 from public.charge_requests where user_id=p_user_id and status='approved' and not accounting_ready) then raise exception using errcode='P0001',message='注文またはチャージを処理中です。少し待って再読み込みしてください'; end if;
  if p_method='balance' and u.balance<p_amount then raise exception using errcode='22023',message='残高が不足しています'; end if;
  insert into public.settlements(user_id,amount,method,period_start,period_end,status,settled_at,settled_by)
  values(p_user_id,p_amount,p_method,p_period_start,p_period_end,'completed',now(),p_actor_id) returning id into sid;
  update public.users set deferred_balance=0,balance=balance-case when p_method='balance' then p_amount else 0 end where id=p_user_id;
  update public.orders set settled_at=now(),settlement_source='deferred_settlement',settlement_id=sid
    where user_id=p_user_id and payment_method='deferred' and payment_status='completed' and coalesce(deferred_settlement_method,'cash')='cash' and settled_at is null and accounting_ready;
  update public.charge_requests set settled_at=now(),settlement_source='deferred_settlement',settlement_id=sid
    where user_id=p_user_id and method='cash' and status='approved' and settled_at is null and accounting_ready;
  if p_method='cash' then insert into public.cashbox_entries(entry_type,direction,amount,note,settlement_id,created_by) values('cash_settlement','in',p_amount,'後払いの現金精算',sid,p_actor_id); end if;
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
  values(p_actor_id,'settlement_completed','settlement',sid::text,'後払いの一括精算を完了しました',jsonb_build_object('user_id',p_user_id,'method',p_method,'amount',p_amount));
  return jsonb_build_object('ok',true,'settlement_id',sid);
end;
$$;

create function public.revert_deferred_collection(p_settlement_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.settlements%rowtype; owner_id uuid;
begin
  if p_actor_id is null then raise exception using errcode='22023',message='操作内容が不正です'; end if;
  select user_id into owner_id from public.settlements where id=p_settlement_id;
  if owner_id is null then raise exception using errcode='P0002',message='精算記録が見つかりません'; end if;
  perform public.lock_user_collection_context(owner_id);
  select * into s from public.settlements where id=p_settlement_id for update;
  if not found then raise exception using errcode='P0002',message='精算記録が見つかりません'; end if;
  if s.status<>'completed' then raise exception using errcode='P0001',message='この精算はすでに変更されています'; end if;
  -- Individual order receipts must be undone via their order, not as an aggregate settlement.
  if exists(select 1 from public.orders where settlement_id=s.id and settlement_source='individual_deferred_order') then raise exception using errcode='P0001',message='個別精算は対象の注文から未精算に戻してください'; end if;
  update public.users set deferred_balance=deferred_balance+s.amount,balance=balance+case when s.method='balance' then s.amount else 0 end where id=owner_id;
  if s.method='cash' then delete from public.cashbox_entries where settlement_id=s.id; end if;
  update public.charge_requests set settled_at=null,settlement_source=null,settlement_id=null where settlement_id=s.id and settlement_source='deferred_settlement';
  update public.orders set settled_at=null,settlement_source=null,settlement_id=null where settlement_id=s.id and settlement_source='deferred_settlement';
  update public.settlements set status='pending',settled_at=null,settled_by=null where id=s.id;
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
  values(p_actor_id,'settlement_reverted','settlement',s.id::text,'一括精算を未精算に戻しました',jsonb_build_object('user_id',owner_id,'method',s.method,'amount',s.amount));
  return jsonb_build_object('ok',true);
end;
$$;

create function public.add_user_wallet_balance(p_user_id uuid,p_amount integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare result integer;
begin
  if p_amount is null or p_amount<=0 then raise exception using errcode='22023',message='追加額を確認してください'; end if;
  update public.users set balance=balance+p_amount where id=p_user_id returning balance into result;
  if not found then raise exception using errcode='P0002',message='利用者が見つかりません'; end if;
  return result;
end;
$$;

revoke all on function public.lock_user_collection_context(uuid), public.admin_pay_order_from_balance(uuid,integer,integer,uuid,text), public.record_cash_collection(text,uuid,boolean,uuid), public.complete_deferred_collection(uuid,integer,text,date,date,uuid), public.revert_deferred_collection(uuid,uuid), public.add_user_wallet_balance(uuid,integer) from public,anon,authenticated;
grant execute on function public.lock_user_collection_context(uuid), public.admin_pay_order_from_balance(uuid,integer,integer,uuid,text), public.record_cash_collection(text,uuid,boolean,uuid), public.complete_deferred_collection(uuid,integer,text,date,date,uuid), public.revert_deferred_collection(uuid,uuid), public.add_user_wallet_balance(uuid,integer) to service_role;

create function public.guard_unfinished_order_refund()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not old.accounting_ready and new.payment_status in ('refunded','cancelled') then
    raise exception using errcode='P0001',message='注文を処理中です。完了後に再読み込みしてください';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_unfinished_order_refund() from public,anon,authenticated;
grant execute on function public.guard_unfinished_order_refund() to service_role;
create trigger orders_guard_unfinished_refund before update on public.orders for each row execute function public.guard_unfinished_order_refund();

-- Compatibility writers add/subtract deltas instead of overwriting a previously read balance.
create function public.adjust_wallet_balances(p_user_id uuid,p_balance_delta integer,p_deferred_delta integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u public.users%rowtype;
begin
  if p_balance_delta is null or p_deferred_delta is null then raise exception using errcode='22023',message='残高の変更額を確認してください'; end if;
  update public.users set balance=balance+p_balance_delta,deferred_balance=deferred_balance+p_deferred_delta
    where id=p_user_id and balance::bigint+p_balance_delta>=0 and deferred_balance::bigint+p_deferred_delta>=0 returning * into u;
  if not found then raise exception using errcode='22023',message='現在の残高または要回収額が不足しています'; end if;
  return jsonb_build_object('ok',true,'balance',u.balance,'deferred_balance',u.deferred_balance);
end;
$$;

create function public.approve_pending_wallet_charge(p_charge_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.charge_requests%rowtype; owner_id uuid;
begin
  if p_actor_id is null then raise exception using errcode='22023',message='操作内容を確認してください'; end if;
  select user_id into owner_id from public.charge_requests where id=p_charge_id;
  if owner_id is null then raise exception using errcode='P0002',message='チャージ申請が見つかりません'; end if;
  perform public.lock_user_collection_context(owner_id);
  select * into c from public.charge_requests where id=p_charge_id;
  if not found then raise exception using errcode='P0002',message='チャージ申請が見つかりません'; end if;
  if c.status<>'pending' then raise exception using errcode='P0001',message='このチャージ申請は処理済みです'; end if;
  perform public.adjust_wallet_balances(owner_id,c.amount,c.amount);
  update public.charge_requests set status='approved',approved_at=now(),approved_by=p_actor_id,accounting_ready=true where id=c.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.adjust_wallet_balances(uuid,integer,integer),public.approve_pending_wallet_charge(uuid,uuid) from public,anon,authenticated;
grant execute on function public.adjust_wallet_balances(uuid,integer,integer),public.approve_pending_wallet_charge(uuid,uuid) to service_role;

-- A top-up refund shares the wallet/receipt locks; it cannot overwrite a wallet payment.
create function public.refund_wallet_charge(p_charge_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.charge_requests%rowtype; owner_id uuid; reward integer; debt integer;
begin
  if p_actor_id is null then raise exception using errcode='22023',message='操作内容を確認してください'; end if;
  select user_id into owner_id from public.charge_requests where id=p_charge_id;
  if owner_id is null then raise exception using errcode='P0002',message='チャージが見つかりません'; end if;
  perform public.lock_user_collection_context(owner_id);
  select * into c from public.charge_requests where id=p_charge_id;
  if c.status<>'approved' or not c.accounting_ready then raise exception using errcode='P0001',message='処理が完了したチャージだけ返金できます'; end if;
  debt := case when c.settled_at is null then c.amount else 0 end;
  perform public.adjust_wallet_balances(owner_id,-c.amount,-debt);
  if c.method='cash' and exists(select 1 from public.cashbox_entries where charge_request_id=c.id)
     or (c.method='cash' and c.settled_at is not null) then
    insert into public.cashbox_entries(entry_type,direction,amount,note,created_by)
    values('manual_out','out',c.amount,'チャージ返金: '||c.id::text,p_actor_id);
  end if;
  select coalesce(sum(delta),0)::integer into reward from public.point_transactions where charge_request_id=c.id and reason_type='charge_reward';
  if reward>0 then
    perform public.record_point_transaction(owner_id,-reward,'charge_refund_reversal',c.id,null,'チャージ返金によるポイント取消',p_actor_id,null);
  end if;
  update public.charge_requests set status='refunded',note=concat_ws(E'\n',nullif(note,''),'返金処理済み') where id=c.id;
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
  values(p_actor_id,'charge_refunded','charge_request',c.id::text,'チャージを返金しました',jsonb_build_object('user_id',owner_id,'amount',c.amount,'deferred_reversal',debt));
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.refund_wallet_charge(uuid,uuid) from public,anon,authenticated;
grant execute on function public.refund_wallet_charge(uuid,uuid) to service_role;
