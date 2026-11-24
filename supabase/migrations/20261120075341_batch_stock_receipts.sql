begin;
-- Existing amounts remain intact. NULL explicitly means a receipt total was
-- recorded without per-product cost allocation; zero would falsely mean free.
alter table public.purchase_run_items alter column unit_price drop not null;
alter table public.purchase_run_items alter column subtotal drop not null;
comment on column public.purchase_run_items.subtotal is 'NULL: no product-level cost breakdown; total is authoritative on purchase_runs.';

create table public.stock_receipts (
  request_id uuid primary key,
  actor_id uuid references public.users(id) on delete set null,
  purchase_run_id uuid references public.purchase_runs(id) on delete set null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.stock_receipts enable row level security;
revoke all on public.stock_receipts from public,anon,authenticated,service_role;
grant select,insert on public.stock_receipts to service_role;
alter table public.stock_history add column restock_batch_id uuid references public.stock_receipts(request_id);
create index stock_history_restock_batch_idx on public.stock_history(restock_batch_id) where restock_batch_id is not null;
create index stock_receipts_created_idx on public.stock_receipts(created_at desc, request_id desc);

create function public.record_stock_receipt(p_request_id uuid,p_input jsonb,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_payload jsonb; v_existing public.stock_receipts%rowtype;
  v_rows jsonb; v_row jsonb; v_purchase jsonb; v_item public.items%rowtype;
  v_count integer; v_seen integer:=0; v_known integer;
  v_rows_result jsonb:='[]'; v_purchase_result jsonb:=null; v_result jsonb;
  v_total integer; v_payer uuid; v_payer_name text; v_source text; v_purchase_id uuid; v_cashbox_id uuid;
  v_now timestamptz:=now(); v_note text; v_sum numeric;
begin
  if p_actor_id is null or not exists(select 1 from public.users where id=p_actor_id and is_active and is_approved) then
    raise exception '管理者のログインを確認してください' using errcode='42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(p_input->'rows') is distinct from 'array' then
    raise exception '入荷情報が不正です' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(p_input->'rows');
  if v_count<1 or v_count>200 then raise exception '商品は1〜200種類指定してください' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'rows') q where
      jsonb_typeof(q) is distinct from 'object'
      or coalesce(q->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(q->'quantity') is distinct from 'number' or coalesce(q->>'quantity','') !~ '^[0-9]+$'
      or (q->>'subtotal' is not null and (jsonb_typeof(q->'subtotal') is distinct from 'number' or (q->>'subtotal') !~ '^[0-9]+$'))) then
    raise exception '各商品の数量・仕入れ額を整数で入力してください' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_input->'rows') q where (q->>'quantity')::numeric<1 or (q->>'quantity')::numeric>2147483647 or (q->>'subtotal')::numeric>2147483647)
    or (select count(distinct (q->>'item_id')::uuid) from jsonb_array_elements(p_input->'rows') q)<>v_count then
    raise exception '商品が重複しているか数量が大きすぎます' using errcode='22023';
  end if;
  select jsonb_agg(jsonb_build_object('item_id',(q->>'item_id')::uuid,'quantity',(q->>'quantity')::integer,'subtotal',(q->>'subtotal')::integer) order by (q->>'item_id')::uuid),
    count(q->>'subtotal'),sum((q->>'subtotal')::numeric) into v_rows,v_known,v_sum from jsonb_array_elements(p_input->'rows') q;
  v_note:=coalesce(nullif(btrim(p_input->>'note'),''),'入荷');
  if length(v_note)>2000 then raise exception 'メモを短くしてください' using errcode='22023'; end if;
  v_purchase:=nullif(p_input->'purchase','null'::jsonb);
  if v_purchase is not null then
    if jsonb_typeof(v_purchase) is distinct from 'object' or coalesce(v_purchase->>'payment_source','') not in ('cashbox','personal_advance')
      or jsonb_typeof(v_purchase->'total_amount') is distinct from 'number' or coalesce(v_purchase->>'total_amount','') !~ '^[0-9]+$'
      or coalesce(v_purchase->>'purchased_by','')<>'' and (v_purchase->>'purchased_by') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '支払元・立替者・レシート合計を確認してください' using errcode='22023';
    end if;
    if (v_purchase->>'total_amount')::numeric<1 or (v_purchase->>'total_amount')::numeric>2147483647
      or length(coalesce(v_purchase->>'vendor',''))>300 or length(coalesce(v_purchase->>'note',''))>2000 then
      raise exception '金額・購入先・メモを確認してください' using errcode='22023';
    end if;
    v_total:=(v_purchase->>'total_amount')::integer; v_source:=v_purchase->>'payment_source';
    if v_known>0 and (v_known<>v_count or v_sum<>v_total) then
      raise exception '商品別仕入れ額の合計がレシート合計と一致しません' using errcode='22023';
    end if;
    v_payer:=case when v_source='personal_advance' then coalesce(nullif(v_purchase->>'purchased_by','')::uuid,p_actor_id) else p_actor_id end;
    -- Normalize before replay comparison; changing display order is not a new receipt.
    v_purchase:=jsonb_build_object('total_amount',v_total,'payment_source',v_source,'purchased_by',v_payer,
      'vendor',nullif(btrim(v_purchase->>'vendor'),''),'note',nullif(btrim(v_purchase->>'note'),''));
  elsif v_known>0 then raise exception '仕入れ額には支払元が必要です' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('rows',v_rows,'note',v_note,'purchase',v_purchase,'actor_id',p_actor_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock-receipt:'||p_request_id::text,0));
  select * into v_existing from public.stock_receipts where request_id=p_request_id;
  if found then
    if v_existing.payload<>v_payload then raise exception '同じ入荷番号で内容を変更できません' using errcode='P0001'; end if;
    return v_existing.result;
  end if;
  if v_purchase is not null then
    select name into v_payer_name from public.users where id=v_payer and is_active and is_approved;
    if not found then raise exception '有効な立替者を選んでください' using errcode='22023'; end if;
  end if;
  -- Checkout locks users before items. Acquire FK user locks first as well,
  -- rather than discovering a user FK lock only after taking item locks.
  perform id from public.users where id=p_actor_id or id=v_payer order by id for key share;
  -- Same item locks as single restock and purchases. Acquire all in UUID order.
  for v_item in select i.* from public.items i where i.id in(select (q->>'item_id')::uuid from jsonb_array_elements(v_rows) q) order by i.id for update loop
    v_seen:=v_seen+1;
    if coalesce(v_item.is_unlimited_stock,false) then raise exception '在庫管理なしの商品は入荷対象にできません' using errcode='22023'; end if;
    select q into v_row from jsonb_array_elements(v_rows) q where (q->>'item_id')::uuid=v_item.id;
    if v_item.stock::bigint+(v_row->>'quantity')::bigint>2147483647 then raise exception '追加後の在庫が大きすぎます' using errcode='22003'; end if;
    v_rows_result:=v_rows_result||jsonb_build_array(jsonb_build_object('item_id',v_item.id,'item_name',v_item.name,'quantity',(v_row->>'quantity')::integer,'subtotal',(v_row->>'subtotal')::integer,'stock_before',v_item.stock,'stock_after',v_item.stock+(v_row->>'quantity')::integer));
  end loop;
  if v_seen<>v_count then raise exception '対象の商品が見つかりません。一覧を再読み込みしてください' using errcode='P0002'; end if;
  if v_purchase is not null then
    insert into public.purchase_runs(total_amount,payment_source,reimbursement_status,vendor,note,purchased_by,created_by)
      values(v_total,v_source,case when v_source='cashbox' then 'not_needed' else 'pending_reimbursement' end,v_purchase->>'vendor',v_purchase->>'note',v_payer,p_actor_id) returning id into v_purchase_id;
    insert into public.purchase_run_items(purchase_run_id,item_id,item_name,quantity,unit_price,subtotal)
      select v_purchase_id,(r->>'item_id')::uuid,r->>'item_name',(r->>'quantity')::integer,
        case when r->>'subtotal' is null then null else round((r->>'subtotal')::numeric/(r->>'quantity')::integer)::integer end,(r->>'subtotal')::integer
      from jsonb_array_elements(v_rows_result) r;
    if v_source='cashbox' then
      insert into public.cashbox_entries(entry_type,direction,amount,purchase_run_id,note,created_by)
        values('restock_cash_out','out',v_total,v_purchase_id,coalesce(v_purchase->>'note','まとめ入荷 '||p_request_id::text),p_actor_id) returning id into v_cashbox_id;
    end if;
    v_purchase_result:=jsonb_build_object('id',v_purchase_id,'payment_source',v_source,'total_amount',v_total,'vendor',v_purchase->>'vendor','purchased_by',v_payer,'payer_name',v_payer_name,'cashbox_entry_id',v_cashbox_id);
  end if;
  v_result:=jsonb_build_object('ok',true,'request_id',p_request_id,'created_at',v_now,'rows',v_rows_result,'purchase',v_purchase_result,'note',v_note);
  insert into public.stock_receipts(request_id,actor_id,purchase_run_id,payload,result,created_at) values(p_request_id,p_actor_id,v_purchase_id,v_payload,v_result,v_now);
  for v_row in select q from jsonb_array_elements(v_rows) q loop
    update public.items set stock=stock+(v_row->>'quantity')::integer where id=(v_row->>'item_id')::uuid;
    insert into public.stock_history(item_id,change_amount,reason,note,created_by,restock_batch_id)
      values((v_row->>'item_id')::uuid,(v_row->>'quantity')::integer,'restock',v_note,p_actor_id,p_request_id);
  end loop;
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
    values(p_actor_id,'stock_restocked','stock_batch',p_request_id::text,v_count::text||'商品の入荷をまとめて記録',jsonb_build_object('request_id',p_request_id,'rows',v_rows_result,'purchase',v_purchase_result));
  return v_result;
end;
$$;
revoke all on function public.record_stock_receipt(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_stock_receipt(uuid,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
-- Totals are calculated in one snapshot, without REST row caps or history limits.
-- deferred_balance includes cash charges and legacy transfers: retain that SSOT.
create function public.read_cashbox_totals() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'expectedAmount',coalesce((select sum(case when direction='in' then amount::bigint else -amount::bigint end) from public.cashbox_entries),0),
  'pendingCashOrdersCount',(select count(*) from public.orders where payment_method='cash' and payment_status='pending'),
  'pendingCashOrderAmount',coalesce((select sum(total_amount::bigint) from public.orders where payment_method='cash' and payment_status='pending'),0),
  'totalCashCollectionAmount',coalesce((select sum(deferred_balance::bigint) from public.users where deferred_balance>0 and is_active),0)
    +coalesce((select sum(total_amount::bigint) from public.orders where payment_method='cash' and payment_status='pending'),0)
    +coalesce((select sum(cash_due_amount::bigint) from public.subscription_payments where payment_status='pending_cash_settlement' and cash_due_amount>0),0),
  'unreimbursedAdvanceAmount',coalesce((select sum(total_amount::bigint) from public.purchase_runs where payment_source='personal_advance' and reimbursement_status='pending_reimbursement'),0),
  'advancePeople',coalesce((select jsonb_agg(p order by p.name,p.id) from (
    select r.purchased_by id,coalesce(u.name,'立替者未登録') name,count(*) count,sum(r.total_amount::bigint) total
    from public.purchase_runs r left join public.users u on u.id=r.purchased_by
    where r.payment_source='personal_advance' and r.reimbursement_status='pending_reimbursement' group by r.purchased_by,u.name
  ) p),'[]'::jsonb)
);
$$;
revoke all on function public.read_cashbox_totals() from public,anon,authenticated;
grant execute on function public.read_cashbox_totals() to service_role;

create table public.stock_adjustments(request_id uuid primary key,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table public.stock_adjustments enable row level security;
revoke all on public.stock_adjustments from public,anon,authenticated,service_role;
grant select,insert on public.stock_adjustments to service_role;
create function public.record_stock_adjustment(p_request_id uuid,p_item_id uuid,p_kind text,p_value integer,p_expected_stock integer,p_note text,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_prior public.stock_adjustments%rowtype;v_payload jsonb;v_item public.items%rowtype;v_after integer;v_delta integer;v_result jsonb;
begin
  if p_actor_id is null or not exists(select 1 from public.users where id=p_actor_id and is_active and is_approved) then raise exception '管理者のログインを確認してください' using errcode='42501';end if;
  if p_request_id is null or p_item_id is null or p_kind is null or p_kind not in('count','discard','return') or p_value is null or p_value<0 or p_expected_stock is null
    or (p_kind<>'count' and p_value=0) or nullif(btrim(p_note),'') is null or length(p_note)>2000 then raise exception '数量と理由を確認してください' using errcode='22023';end if;
  v_payload:=jsonb_build_object('item_id',p_item_id,'kind',p_kind,'value',p_value,'expected_stock',p_expected_stock,'note',btrim(p_note),'actor_id',p_actor_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock-adjustment:'||p_request_id::text,0));
  select * into v_prior from public.stock_adjustments where request_id=p_request_id;
  if found then
    if v_prior.payload<>v_payload then raise exception '同じ調整番号で内容を変更できません' using errcode='P0001';end if;
    return v_prior.result;
  end if;
  perform id from public.users where id=p_actor_id for key share;
  select * into v_item from public.items where id=p_item_id for update;
  if not found then raise exception '商品が見つかりません' using errcode='P0002';end if;
  if coalesce(v_item.is_unlimited_stock,false) then raise exception '在庫管理なしの商品は調整できません' using errcode='22023';end if;
  if v_item.stock<>p_expected_stock then raise exception '在庫が変わりました。最新の在庫と実物を確認し直してください' using errcode='P0001';end if;
  v_after:=case when p_kind='count' then p_value else v_item.stock-p_value end;
  if v_after<0 then raise exception '現在の在庫数を超えて減らせません' using errcode='22023';end if;
  v_delta:=v_after-v_item.stock;
  update public.items set stock=v_after where id=p_item_id;
  insert into public.stock_history(item_id,change_amount,reason,note,created_by) values(p_item_id,v_delta,case when p_kind='discard' then 'discard' else 'adjustment' end,
    case p_kind when 'count' then '棚卸: ' when 'discard' then '廃棄: ' else '仕入先への返品: ' end||btrim(p_note),p_actor_id);
  v_result:=jsonb_build_object('ok',true,'request_id',p_request_id,'item_id',p_item_id,'stock_before',v_item.stock,'stock_after',v_after,'change_amount',v_delta);
  insert into public.stock_adjustments(request_id,payload,result) values(p_request_id,v_payload,v_result);
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata) values(p_actor_id,'stock_adjusted','item',p_item_id::text,v_item.name||'の在庫調整を記録',v_payload||v_result);
  return v_result;
end;
$$;
revoke all on function public.record_stock_adjustment(uuid,uuid,text,integer,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.record_stock_adjustment(uuid,uuid,text,integer,integer,text,uuid) to service_role;
commit;
