begin;

create table public.stocktakes (
  request_id uuid primary key,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index stocktakes_newest on public.stocktakes (created_at desc, request_id desc);
alter table public.stocktakes enable row level security;
revoke all on public.stocktakes from public, anon, authenticated, service_role;
grant select, insert on public.stocktakes to service_role;

create function public.record_stocktake(p_request_id uuid, p_input jsonb, p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_actor_name text;
  v_note text;
  v_rows jsonb := '[]';
  v_row jsonb;
  v_item public.items%rowtype;
  v_actual integer;
  v_prior public.stocktakes%rowtype;
  v_payload jsonb;
  v_entries jsonb := '[]';
  v_changed integer := 0;
  v_result jsonb;
  v_now timestamptz := now();
begin
  select coalesce(name, '担当者') into v_actor_name
  from public.users where id = p_actor_id and is_active and is_approved for key share;
  if not found then
    raise exception '管理者のログインを確認してください' using errcode = '42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_input->'note') is distinct from 'string'
    or jsonb_typeof(p_input->'entries') is distinct from 'array' then
    raise exception '棚卸の内容を確認してください' using errcode = '22023';
  end if;
  v_note := btrim(p_input->>'note');
  if length(v_note) > 2000 or jsonb_array_length(p_input->'entries') not between 1 and 200 then
    raise exception '棚卸の商品数とメモを確認してください' using errcode = '22023';
  end if;

  for v_row in select e from jsonb_array_elements(p_input->'entries') e loop
    if jsonb_typeof(v_row) is distinct from 'object'
      or coalesce(v_row->>'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(v_row->'expected_stock') is distinct from 'number'
      or coalesce(v_row->>'expected_stock', '') !~ '^-?[0-9]+$'
      or jsonb_typeof(v_row->'actual_count') is distinct from 'number'
      or coalesce(v_row->>'actual_count', '') !~ '^[0-9]+$' then
      raise exception '商品と棚卸の数量を確認してください' using errcode = '22023';
    end if;
    if (v_row->>'actual_count')::numeric > 2147483647 then
      raise exception '棚卸の実数が大きすぎます' using errcode = '22003';
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'item_id', (v_row->>'item_id')::uuid,
      'expected_stock', (v_row->>'expected_stock')::integer,
      'actual_count', (v_row->>'actual_count')::integer
    ));
  end loop;
  if (select count(distinct e->>'item_id') from jsonb_array_elements(v_rows) e) <> jsonb_array_length(v_rows) then
    raise exception '棚卸に同じ商品が重複しています' using errcode = '22023';
  end if;
  select jsonb_agg(e order by e->>'item_id') into v_rows from jsonb_array_elements(v_rows) e;
  v_payload := jsonb_build_object('actor_id', p_actor_id, 'note', v_note, 'entries', v_rows);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stocktake:' || p_request_id::text, 0));
  select * into v_prior from public.stocktakes where request_id = p_request_id;
  if found then
    if v_prior.payload <> v_payload then
      raise exception '同じ登録番号で棚卸の内容を変更できません' using errcode = 'P0001';
    end if;
    return v_prior.result;
  end if;

  -- Match the item lock order in orders and restocks. All counts are one transaction.
  perform id from public.items
  where id in (select (e->>'item_id')::uuid from jsonb_array_elements(v_rows) e)
  order by id for update;
  for v_row in select e from jsonb_array_elements(v_rows) e loop
    select * into v_item from public.items where id = (v_row->>'item_id')::uuid;
    if not found or coalesce(v_item.is_unlimited_stock, false) then
      raise exception '在庫を管理している商品を選んでください' using errcode = '22023';
    end if;
    if v_item.stock <> (v_row->>'expected_stock')::integer then
      raise exception '%の在庫が変わりました。実物を数え直してください', v_item.name using errcode = 'P0001';
    end if;
    v_actual := (v_row->>'actual_count')::integer;
    if v_actual <> v_item.stock then
      perform public.record_stock_adjustment(
        pg_catalog.gen_random_uuid(), v_item.id, 'count', v_actual, v_item.stock,
        coalesce(nullif(v_note, ''), '実物を数えて確認'), p_actor_id
      );
      v_changed := v_changed + 1;
    end if;
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'item_id', v_item.id, 'item_name', v_item.name, 'stock_before', v_item.stock, 'stock_after', v_actual
    ));
  end loop;
  v_result := jsonb_build_object(
    'ok', true, 'request_id', p_request_id, 'created_at', v_now, 'actor_name', v_actor_name,
    'item_count', jsonb_array_length(v_entries), 'changed_count', v_changed, 'note', v_note, 'entries', v_entries
  );
  insert into public.stocktakes(request_id, payload, result, created_at) values (p_request_id, v_payload, v_result, v_now);
  insert into public.admin_audit_logs(actor_id, action_type, target_type, target_id, summary, metadata)
  values (p_actor_id, 'stocktake_recorded', 'stocktake', p_request_id::text, '棚卸を記録',
    jsonb_build_object('item_count', jsonb_array_length(v_entries), 'changed_count', v_changed));
  return v_result;
end
$$;
revoke all on function public.record_stocktake(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.record_stocktake(uuid, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
