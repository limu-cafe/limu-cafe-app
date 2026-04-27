alter table public.items
add column if not exists is_unlimited_stock boolean not null default false;

create or replace function public.decrement_stock(p_item_id uuid, p_quantity integer)
returns void as $$
declare
  v_item record;
begin
  select stock, coalesce(is_unlimited_stock, false) as is_unlimited_stock
  into v_item
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception '商品が見つかりません';
  end if;

  if v_item.is_unlimited_stock then
    return;
  end if;

  if v_item.stock < p_quantity then
    raise exception '在庫が不足しています';
  end if;

  update public.items
  set stock = stock - p_quantity
  where id = p_item_id;
end;
$$ language plpgsql;

create or replace function public.refund_order(
  p_order_id uuid,
  p_actor_id uuid default null
)
returns void as $$
declare
  v_order record;
  v_item record;
begin
  select id, user_id, total_amount, payment_method, payment_status, points_used
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '注文が見つかりません';
  end if;

  if v_order.payment_method = 'stripe' then
    raise exception 'クレカ注文の返金はまだ対応していません';
  end if;

  if v_order.payment_status not in ('pending', 'completed') then
    raise exception 'この注文は返金できません';
  end if;

  for v_item in
    select
      oi.item_id,
      oi.quantity,
      coalesce(i.is_unlimited_stock, false) as is_unlimited_stock
    from public.order_items oi
    join public.items i on i.id = oi.item_id
    where oi.order_id = p_order_id
  loop
    if not v_item.is_unlimited_stock then
      update public.items
      set stock = stock + v_item.quantity
      where id = v_item.item_id;

      insert into public.stock_history (
        item_id,
        change_amount,
        reason,
        order_id,
        note,
        created_by
      )
      values (
        v_item.item_id,
        v_item.quantity,
        'adjustment',
        p_order_id,
        '注文返金による在庫戻し',
        p_actor_id
      );
    end if;
  end loop;

  if v_order.payment_method = 'balance' then
    update public.users
    set balance = balance + (v_order.total_amount - coalesce(v_order.points_used, 0))
    where id = v_order.user_id;
  elsif v_order.payment_method = 'deferred' then
    update public.users
    set deferred_balance = deferred_balance - (v_order.total_amount - coalesce(v_order.points_used, 0))
    where id = v_order.user_id
      and deferred_balance >= (v_order.total_amount - coalesce(v_order.points_used, 0));

    if not found then
      raise exception '後払い残高を戻せませんでした';
    end if;
  elsif v_order.payment_method = 'cash' and v_order.payment_status = 'completed' then
    insert into public.cashbox_entries (
      entry_type,
      direction,
      amount,
      note,
      created_by
    )
    values (
      'manual_out',
      'out',
      v_order.total_amount,
      concat('注文返金: ', p_order_id::text),
      p_actor_id
    );
  end if;

  if coalesce(v_order.points_used, 0) > 0 then
    perform public.record_point_transaction(
      v_order.user_id,
      v_order.points_used,
      'order_refund',
      null,
      p_order_id,
      concat('注文返金によるポイント返却 ', v_order.points_used::text, 'pt'),
      p_actor_id,
      null
    );
  end if;

  update public.orders
  set payment_status = 'refunded'
  where id = p_order_id;
end;
$$ language plpgsql;

create or replace function public.cancel_non_card_order(
  p_order_id uuid,
  p_actor_id uuid default null
)
returns void as $$
declare
  v_order record;
  v_item record;
begin
  select id, user_id, total_amount, payment_method, payment_status, points_used
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '注文が見つかりません';
  end if;

  if v_order.payment_method not in ('balance', 'deferred') then
    raise exception 'この支払い方法の注文はキャンセルできません';
  end if;

  if v_order.payment_status <> 'completed' then
    raise exception '完了済みの注文だけキャンセルできます';
  end if;

  for v_item in
    select
      oi.item_id,
      oi.quantity,
      coalesce(i.is_unlimited_stock, false) as is_unlimited_stock
    from public.order_items oi
    join public.items i on i.id = oi.item_id
    where oi.order_id = p_order_id
  loop
    if not v_item.is_unlimited_stock then
      update public.items
      set stock = stock + v_item.quantity
      where id = v_item.item_id;

      insert into public.stock_history (
        item_id,
        change_amount,
        reason,
        order_id,
        note,
        created_by
      )
      values (
        v_item.item_id,
        v_item.quantity,
        'adjustment',
        p_order_id,
        '注文キャンセルによる在庫戻し',
        p_actor_id
      );
    end if;
  end loop;

  if v_order.payment_method = 'balance' then
    update public.users
    set balance = balance + (v_order.total_amount - coalesce(v_order.points_used, 0))
    where id = v_order.user_id;
  elsif v_order.payment_method = 'deferred' then
    update public.users
    set deferred_balance = deferred_balance - (v_order.total_amount - coalesce(v_order.points_used, 0))
    where id = v_order.user_id
      and deferred_balance >= (v_order.total_amount - coalesce(v_order.points_used, 0));

    if not found then
      raise exception '後払い残高を戻せませんでした';
    end if;
  end if;

  if coalesce(v_order.points_used, 0) > 0 then
    perform public.record_point_transaction(
      v_order.user_id,
      v_order.points_used,
      'order_refund',
      null,
      p_order_id,
      concat('注文キャンセルによるポイント返却 ', v_order.points_used::text, 'pt'),
      p_actor_id,
      null
    );
  end if;

  update public.orders
  set payment_status = 'cancelled'
  where id = p_order_id;
end;
$$ language plpgsql;
