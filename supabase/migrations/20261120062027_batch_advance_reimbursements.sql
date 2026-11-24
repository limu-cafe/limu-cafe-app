-- Additive only: retain every historic purchase, cashbox entry and balance.
-- One receipt represents one physical payout; linked per-purchase ledger rows
-- preserve existing cashbox reconciliation and unique constraints.
create table public.advance_reimbursement_batches (
  operation_id uuid primary key,
  recipient_id uuid references public.users(id) on delete set null,
  recipient_name text not null,
  actor_id uuid references public.users(id) on delete set null,
  runs jsonb not null,
  items jsonb not null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);
alter table public.advance_reimbursement_batches enable row level security;
revoke all on public.advance_reimbursement_batches from public, anon, authenticated, service_role;
grant select, insert on public.advance_reimbursement_batches to service_role;

create function public.admin_reimburse_advances(
  p_operation_id uuid, p_recipient_id uuid, p_runs jsonb, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_quotes jsonb; v_items jsonb; v_count integer; v_amount bigint := 0;
  v_run public.purchase_runs%rowtype;
  v_prior public.advance_reimbursement_batches%rowtype;
  v_recipient_name text; v_now timestamptz := now(); v_seen integer := 0;
begin
  -- Management access is verified by the signed admin session in the API.
  -- Do not substitute users.role: approved members can hold management access.
  if p_actor_id is null or not exists (
    select 1 from public.users where id = p_actor_id and is_active and is_approved
  ) then raise exception '管理者のログインを確認してください' using errcode = '42501'; end if;
  if p_operation_id is null or jsonb_typeof(p_runs) is distinct from 'array' then
    raise exception '精算対象が不正です' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_runs);
  if v_count < 1 or v_count > 10000 or (p_recipient_id is null and v_count <> 1) then
    raise exception '精算対象が不正です' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_runs) q where
      jsonb_typeof(q) <> 'object'
      or coalesce(q->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(q->'expected_amount') is distinct from 'number'
      or coalesce(q->>'expected_amount','') !~ '^[0-9]+$') then
    raise exception '精算対象が不正です' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_runs) q where
      (q->>'expected_amount')::numeric < 1 or (q->>'expected_amount')::numeric > 2147483647)
    or (select count(distinct (q->>'id')::uuid) from jsonb_array_elements(p_runs) q) <> v_count then
    raise exception '精算対象が重複しているか金額が不正です' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('id',(q->>'id')::uuid,'expected_amount',(q->>'expected_amount')::integer) order by (q->>'id')::uuid)
    into v_quotes from jsonb_array_elements(p_runs) q;
  -- Serializes retries of one payout before checking its immutable receipt.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('advance-reimbursement:' || p_operation_id::text, 0));
  select * into v_prior from public.advance_reimbursement_batches where operation_id = p_operation_id;
  if found then
    if v_prior.recipient_id is distinct from p_recipient_id or v_prior.actor_id is distinct from p_actor_id or v_prior.runs <> v_quotes then
      raise exception '同じ精算番号に異なる内容は指定できません' using errcode = 'P0001';
    end if;
    return jsonb_build_object('ok',true,'operation_id',p_operation_id,'recipient_id',v_prior.recipient_id,'recipient_name',v_prior.recipient_name,
      'count',v_count,'amount',v_prior.amount,'created_at',v_prior.created_at,'items',v_prior.items,'already_recorded',true);
  end if;
  -- Every caller, including the old single-record endpoint, locks in UUID order.
  for v_run in select r.* from public.purchase_runs r
    where r.id in (select (q->>'id')::uuid from jsonb_array_elements(v_quotes) q)
    order by r.id for update
  loop
    v_seen := v_seen + 1;
    if v_run.payment_source <> 'personal_advance' or v_run.reimbursement_status <> 'pending_reimbursement'
       or v_run.purchased_by is distinct from p_recipient_id
       or v_run.total_amount <> (select (q->>'expected_amount')::integer from jsonb_array_elements(v_quotes) q where (q->>'id')::uuid = v_run.id)
       or exists (select 1 from public.cashbox_entries where purchase_run_id = v_run.id and entry_type = 'advance_reimbursement') then
      raise exception '立替の状態・立替者・金額が変わりました。一覧を再読み込みしてください' using errcode = 'P0001';
    end if;
    v_amount := v_amount + v_run.total_amount;
  end loop;
  if v_seen <> v_count then raise exception '精算対象の立替が見つかりません' using errcode = 'P0002'; end if;
  select name into v_recipient_name from public.users where id = p_recipient_id;
  v_recipient_name := coalesce(v_recipient_name, '立替者未登録');
  select jsonb_agg(jsonb_build_object('id',r.id,'amount',r.total_amount,'created_at',r.created_at,'vendor',r.vendor,
      'title',coalesce((select string_agg(i.item_name || ' × ' || i.quantity::text, ' / ' order by i.id) from public.purchase_run_items i where i.purchase_run_id = r.id),nullif(split_part(r.note,' / ',1),''),'立替記録')) order by r.id)
    into v_items from public.purchase_runs r where r.id in (select (q->>'id')::uuid from jsonb_array_elements(v_quotes) q);
  insert into public.advance_reimbursement_batches(operation_id,recipient_id,recipient_name,actor_id,runs,items,amount,created_at)
    values (p_operation_id,p_recipient_id,v_recipient_name,p_actor_id,v_quotes,v_items,v_amount,v_now);
  insert into public.cashbox_entries(entry_type,direction,amount,note,purchase_run_id,created_by)
    select 'advance_reimbursement','out',r.total_amount,'立替まとめ精算 ' || p_operation_id::text,r.id,p_actor_id
    from public.purchase_runs r where r.id in (select (q->>'id')::uuid from jsonb_array_elements(v_quotes) q) order by r.id;
  update public.purchase_runs set reimbursement_status = 'reimbursed', reimbursed_at = v_now, reimbursed_by = p_actor_id
    where id in (select (q->>'id')::uuid from jsonb_array_elements(v_quotes) q);
  insert into public.admin_audit_logs(actor_id,action_type,target_type,target_id,summary,metadata)
    values(p_actor_id,'advance_reimbursement','reimbursement_batch',p_operation_id::text,
      v_recipient_name || 'への立替' || v_count::text || '件をまとめて精算',
      jsonb_build_object('recipient_id',p_recipient_id,'count',v_count,'amount',v_amount,'runs',v_quotes));
  return jsonb_build_object('ok',true,'operation_id',p_operation_id,'recipient_id',p_recipient_id,'recipient_name',v_recipient_name,
    'count',v_count,'amount',v_amount,'created_at',v_now,'items',v_items,'already_recorded',false);
end;
$$;

-- Compatibility for existing clients. Shares the same transactional core,
-- row locks and receipt uniqueness as bulk settlement; no REST write loop.
create function public.admin_reimburse_advance(p_purchase_run_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_run public.purchase_runs%rowtype;
begin
  select * into v_run from public.purchase_runs where id = p_purchase_run_id;
  if not found then raise exception '立替が見つかりません' using errcode = 'P0002'; end if;
  return public.admin_reimburse_advances(p_purchase_run_id,v_run.purchased_by,
    jsonb_build_array(jsonb_build_object('id',v_run.id,'expected_amount',v_run.total_amount)),p_actor_id);
end;
$$;
revoke all on function public.admin_reimburse_advances(uuid,uuid,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.admin_reimburse_advance(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_reimburse_advances(uuid,uuid,jsonb,uuid) to service_role;
grant execute on function public.admin_reimburse_advance(uuid,uuid) to service_role;
