begin;
-- Do not backdate created_at or rewrite any historical business rows.
-- Dates are explicit business attributes; NULL means unknown.
alter table public.purchase_runs add column purchased_on date;
alter table public.stock_history add column received_on date;
alter table public.cashbox_entries add column occurred_on date;
alter table public.cashbox_entries add column stock_receipt_id uuid references public.stock_receipts(request_id) deferrable initially deferred;
create table public.stock_intakes(request_id uuid primary key,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table public.stock_intakes enable row level security;
revoke all on public.stock_intakes from public,anon,authenticated,service_role;
grant select,insert on public.stock_intakes to service_role;
alter table public.stock_receipts add column intake_id uuid references public.stock_intakes(request_id) deferrable initially deferred;
create index stock_receipts_intake_idx on public.stock_receipts(intake_id) where intake_id is not null;
-- Retain the legacy function signature and old request payload fingerprints.
create or replace function public.record_stock_receipt(p_request_id uuid,p_input jsonb,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_payload jsonb; v_existing public.stock_receipts%rowtype;
  v_rows jsonb; v_row jsonb; v_purchase jsonb; v_item public.items%rowtype;
  v_count integer; v_seen integer:=0; v_known integer;
  v_rows_result jsonb:='[]'; v_purchase_result jsonb:=null; v_result jsonb;
  v_total integer; v_payer uuid; v_payer_name text; v_source text; v_purchase_id uuid; v_cashbox_id uuid;
  v_now timestamptz:=now(); v_note text; v_sum numeric;
  v_add_stock boolean:=true;v_purchased_on date;v_received_on date;v_adjustment integer:=0;v_adjustment_explicit boolean:=false;v_intake_id uuid;
begin
  if p_actor_id is null or not exists(select 1 from public.users where id=p_actor_id and is_active and is_approved) then
    raise exception '管理者のログインを確認してください' using errcode='42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(p_input->'rows') is distinct from 'array' then
    raise exception '入荷情報が不正です' using errcode='22023';
  end if;
  if p_input ? 'add_stock' then
    if jsonb_typeof(p_input->'add_stock') is distinct from 'boolean' then raise exception '在庫への反映方法が不正です' using errcode='22023';end if;
    v_add_stock:=(p_input->>'add_stock')::boolean;
  end if;
  begin
    if p_input->>'purchased_on' is not null then
      if (p_input->>'purchased_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date';end if;
      v_purchased_on:=(p_input->>'purchased_on')::date;
      if v_purchased_on<'1900-01-01'::date or v_purchased_on>'9999-12-31'::date then raise exception 'bad date';end if;
    end if;
    if p_input->>'received_on' is not null then
      if (p_input->>'received_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date';end if;
      v_received_on:=(p_input->>'received_on')::date;
      if v_received_on<'1900-01-01'::date or v_received_on>'9999-12-31'::date then raise exception 'bad date';end if;
    end if;
    v_intake_id:=(p_input->>'intake_id')::uuid;
  exception when others then raise exception '日付または登録番号を確認してください' using errcode='22023';end;
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
    v_adjustment_explicit:=v_purchase ? 'adjustment_amount';
    if v_adjustment_explicit then
      if jsonb_typeof(v_purchase->'adjustment_amount') is distinct from 'number' or (v_purchase->>'adjustment_amount') !~ '^-?[0-9]+$' or abs((v_purchase->>'adjustment_amount')::numeric)>2147483647 then raise exception '送料・値引きは整数で入力してください' using errcode='22023';end if;
      v_adjustment:=(v_purchase->>'adjustment_amount')::integer;
    end if;
    v_total:=(v_purchase->>'total_amount')::integer; v_source:=v_purchase->>'payment_source';
    if v_known>0 and (v_known<>v_count or v_sum+v_adjustment<>v_total) then
      raise exception '商品別仕入れ額の合計がレシート合計と一致しません' using errcode='22023';
    end if;
    v_payer:=case when v_source='personal_advance' then coalesce(nullif(v_purchase->>'purchased_by','')::uuid,p_actor_id) else p_actor_id end;
    -- Normalize before replay comparison; changing display order is not a new receipt.
    v_purchase:=jsonb_build_object('total_amount',v_total,'payment_source',v_source,'purchased_by',v_payer,
      'vendor',nullif(btrim(v_purchase->>'vendor'),''),'note',nullif(btrim(v_purchase->>'note'),''));
    if v_adjustment_explicit then v_purchase:=v_purchase||jsonb_build_object('adjustment_amount',v_adjustment);end if;
  elsif v_known>0 then raise exception '仕入れ額には支払元が必要です' using errcode='22023'; end if;
  if not v_add_stock and v_purchase is null then raise exception '在庫登録済みの場合は仕入れ情報を入力してください' using errcode='22023';end if;
  v_payload:=jsonb_build_object('rows',v_rows,'note',v_note,'purchase',v_purchase,'actor_id',p_actor_id);
  if p_input ? 'add_stock' then v_payload:=v_payload||jsonb_build_object('add_stock',v_add_stock);end if;
  if p_input ? 'purchased_on' then v_payload:=v_payload||jsonb_build_object('purchased_on',v_purchased_on);end if;
  if p_input ? 'received_on' then v_payload:=v_payload||jsonb_build_object('received_on',v_received_on);end if;
  if p_input ? 'intake_id' then v_payload:=v_payload||jsonb_build_object('intake_id',v_intake_id);end if;
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
    if v_add_stock and coalesce(v_item.is_unlimited_stock,false) then raise exception '在庫管理なしの商品は入荷対象にできません' using errcode='22023'; end if;
    select q into v_row from jsonb_array_elements(v_rows) q where (q->>'item_id')::uuid=v_item.id;
    if v_add_stock and v_item.stock::bigint+(v_row->>'quantity')::bigint>2147483647 then raise exception '追加後の在庫が大きすぎます' using errcode='22003'; end if;
    v_rows_result:=v_rows_result||jsonb_build_array(jsonb_build_object('item_id',v_item.id,'item_name',v_item.name,'quantity',(v_row->>'quantity')::integer,'subtotal',(v_row->>'subtotal')::integer,'stock_before',v_item.stock,'stock_after',case when v_add_stock then v_item.stock+(v_row->>'quantity')::integer else v_item.stock end));
  end loop;
  if v_seen<>v_count then raise exception '対象の商品が見つかりません。一覧を再読み込みしてください' using errcode='P0002'; end if;
  if v_purchase is not null then
    insert into public.purchase_runs(total_amount,payment_source,reimbursement_status,vendor,note,purchased_by,created_by,purchased_on)
      values(v_total,v_source,case when v_source='cashbox' then 'not_needed' else 'pending_reimbursement' end,v_purchase->>'vendor',v_purchase->>'note',v_payer,p_actor_id,v_purchased_on) returning id into v_purchase_id;
    insert into public.purchase_run_items(purchase_run_id,item_id,item_name,quantity,unit_price,subtotal)
      select v_purchase_id,(r->>'item_id')::uuid,r->>'item_name',(r->>'quantity')::integer,
        case when r->>'subtotal' is null then null else round((r->>'subtotal')::numeric/(r->>'quantity')::integer)::integer end,(r->>'subtotal')::integer
      from jsonb_array_elements(v_rows_result) r;
    if v_source='cashbox' then
      insert into public.cashbox_entries(entry_type,direction,amount,purchase_run_id,note,created_by,occurred_on,stock_receipt_id)
        values('restock_cash_out','out',v_total,v_purchase_id,coalesce(v_purchase->>'note','まとめ入荷 '||p_request_id::text),p_actor_id,v_purchased_on,p_request_id) returning id into v_cashbox_id;
    end if;
    v_purchase_result:=jsonb_build_object('id',v_purchase_id,'payment_source',v_source,'total_amount',v_total,'vendor',v_purchase->>'vendor','purchased_by',v_payer,'payer_name',v_payer_name,'cashbox_entry_id',v_cashbox_id);
    if v_adjustment_explicit then v_purchase_result:=v_purchase_result||jsonb_build_object('adjustment_amount',v_adjustment);end if;
  end if;
  v_result:=jsonb_build_object('ok',true,'request_id',p_request_id,'created_at',v_now,'rows',v_rows_result,'purchase',v_purchase_result,'note',v_note);
  if p_input ? 'add_stock' then v_result:=v_result||jsonb_build_object('add_stock',v_add_stock);end if;
  if p_input ? 'purchased_on' then v_result:=v_result||jsonb_build_object('purchased_on',v_purchased_on);end if;
  if p_input ? 'received_on' then v_result:=v_result||jsonb_build_object('received_on',v_received_on);end if;
  if v_intake_id is not null then v_result:=v_result||jsonb_build_object('intake_id',v_intake_id);end if;
  insert into public.stock_receipts(request_id,actor_id,purchase_run_id,payload,result,created_at,intake_id) values(p_request_id,p_actor_id,v_purchase_id,v_payload,v_result,v_now,v_intake_id);
  if v_add_stock then
  for v_row in select q from jsonb_array_elements(v_rows) q loop
    update public.items set stock=stock+(v_row->>'quantity')::integer where id=(v_row->>'item_id')::uuid;
    insert into public.stock_history(item_id,change_amount,reason,note,created_by,restock_batch_id,received_on)
      values((v_row->>'item_id')::uuid,(v_row->>'quantity')::integer,'restock',v_note,p_actor_id,p_request_id,v_received_on);
  end loop;
  end if;
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
    values(p_actor_id,'stock_restocked','stock_batch',p_request_id::text,v_count::text||'商品の入荷をまとめて記録',jsonb_build_object('request_id',p_request_id,'rows',v_rows_result,'purchase',v_purchase_result));
  return v_result;
end;
$$;
revoke all on function public.record_stock_receipt(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_stock_receipt(uuid,jsonb,uuid) to service_role;

create function public.record_stock_intake(p_request_id uuid,p_input jsonb,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_receipts jsonb;v_payload jsonb;v_prior public.stock_intakes%rowtype;v_receipt jsonb;v_result jsonb;v_results jsonb:='[]';v_stock jsonb;v_total bigint:=0;v_now timestamptz:=now();v_id uuid;
begin
 if p_actor_id is null or not exists(select 1 from public.users where id=p_actor_id and is_active and is_approved) then raise exception '管理者のログインを確認してください' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_input->'receipts') is distinct from 'array' then raise exception '買い物の一覧が不正です' using errcode='22023';end if;
 if jsonb_array_length(p_input->'receipts')<1 or jsonb_array_length(p_input->'receipts')>50 then raise exception '買い物は1〜50件で入力してください' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_input->'receipts') r where jsonb_typeof(r) is distinct from 'object'
   or coalesce(r->>'receipt_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(r->'rows') is distinct from 'array') then raise exception '買い物ごとの記録番号・明細を確認してください' using errcode='22023';end if;
 if (select count(distinct (r->>'receipt_id')::uuid) from jsonb_array_elements(p_input->'receipts') r)<>jsonb_array_length(p_input->'receipts')
   or (select sum(jsonb_array_length(r->'rows')) from jsonb_array_elements(p_input->'receipts') r)>200 then raise exception '買い物の重複または明細数を確認してください' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_input->'receipts') r cross join lateral jsonb_array_elements(r->'rows') q where
   coalesce(q->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(q->'quantity') is distinct from 'number' or coalesce(q->>'quantity','') !~ '^[0-9]+$'
   or (q->>'quantity')::numeric<1 or (q->>'quantity')::numeric>2147483647)
   or exists(select 1 from jsonb_array_elements(p_input->'receipts') r where r->>'add_stock' is not null and jsonb_typeof(r->'add_stock')<>'boolean'
     or r->'purchase'->>'purchased_by' is not null and (r->'purchase'->>'purchased_by') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
   raise exception '商品・数量・立替者を確認してください' using errcode='22023';end if;
 select jsonb_agg((r-'receipt_id'-'rows')||jsonb_build_object('receipt_id',(r->>'receipt_id')::uuid,'rows',(select jsonb_agg(q order by (q->>'item_id')::uuid) from jsonb_array_elements(r->'rows') q)) order by (r->>'receipt_id')::uuid)
   into v_receipts from jsonb_array_elements(p_input->'receipts') r;
 v_payload:=jsonb_build_object('receipts',v_receipts,'actor_id',p_actor_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock-intake:'||p_request_id::text,0));
 select * into v_prior from public.stock_intakes where request_id=p_request_id;
 if found then
  if v_prior.payload<>v_payload then raise exception '同じ登録番号で買い物の内容を変更できません' using errcode='P0001';end if;
  return v_prior.result;
 end if;
 -- Lock every child operation first, then every FK user, then all item rows.
 -- This matches single-receipt, checkout and retry lock order.
 for v_id in select (r->>'receipt_id')::uuid from jsonb_array_elements(v_receipts) r order by 1 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock-receipt:'||v_id::text,0));
  if exists(select 1 from public.stock_receipts where request_id=v_id) then raise exception 'この買い物は既に登録されています。履歴を確認してください' using errcode='P0001';end if;
 end loop;
 perform id from public.users where id=p_actor_id or id in(select (r->'purchase'->>'purchased_by')::uuid from jsonb_array_elements(v_receipts) r) order by id for key share;
 perform id from public.items where id in(select (q->>'item_id')::uuid from jsonb_array_elements(v_receipts) r cross join lateral jsonb_array_elements(r->'rows') q) order by id for update;
 if exists(select 1 from public.items i join (
  select (q->>'item_id')::uuid item_id,sum((q->>'quantity')::bigint) quantity from jsonb_array_elements(v_receipts) r cross join lateral jsonb_array_elements(r->'rows') q
  where coalesce((r->>'add_stock')::boolean,true) group by 1
 ) s on s.item_id=i.id where i.stock::bigint+s.quantity>2147483647) then raise exception '合計した入荷数が大きすぎます' using errcode='22003';end if;
 select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'item_name',i.name,'quantity',s.quantity,'stock_before',i.stock,'stock_after',i.stock+s.quantity) order by i.id),'[]') into v_stock from public.items i join (
  select (q->>'item_id')::uuid item_id,sum((q->>'quantity')::bigint) quantity from jsonb_array_elements(v_receipts) r cross join lateral jsonb_array_elements(r->'rows') q
  where coalesce((r->>'add_stock')::boolean,true) group by 1
 ) s on s.item_id=i.id;
 for v_receipt in select r from jsonb_array_elements(v_receipts) r loop
  v_result:=public.record_stock_receipt((v_receipt->>'receipt_id')::uuid,(v_receipt-'receipt_id')||jsonb_build_object('intake_id',p_request_id),p_actor_id);
  v_results:=v_results||jsonb_build_array(v_result);v_total:=v_total+coalesce((v_result->'purchase'->>'total_amount')::bigint,0);
 end loop;
 v_result:=jsonb_build_object('ok',true,'request_id',p_request_id,'created_at',v_now,'receipts',v_results,'stock_totals',v_stock,'total_amount',v_total);
 insert into public.stock_intakes(request_id,payload,result,created_at) values(p_request_id,v_payload,v_result,v_now);
 insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata) values(p_actor_id,'stock_intake_recorded','stock_intake',p_request_id::text,jsonb_array_length(v_receipts)::text||'件の買い物をまとめて登録',jsonb_build_object('receipt_ids',(select jsonb_agg(r->>'receipt_id') from jsonb_array_elements(v_receipts) r),'total_amount',v_total));
 return v_result;
end;
$$;
revoke all on function public.record_stock_intake(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_stock_intake(uuid,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
