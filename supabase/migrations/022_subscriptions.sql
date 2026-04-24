create table if not exists public.subscription_products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  english_name text,
  description text,
  price integer not null check (price > 0),
  billing_interval_count integer not null check (billing_interval_count > 0),
  billing_interval_unit text not null check (billing_interval_unit in ('day', 'week', 'month')),
  points_enabled boolean not null default true,
  balance_enabled boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_product_id uuid not null references public.subscription_products(id) on delete cascade,
  status text not null check (status in ('active', 'cancel_at_period_end', 'expired')),
  billing_anchor_at timestamptz not null,
  current_period_start_at timestamptz,
  current_period_end_at timestamptz,
  next_billing_at timestamptz,
  end_month date not null,
  payment_priority text[] not null default array['points', 'balance', 'cash']::text[],
  allow_partial_payment boolean not null default true,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_payments (
  id uuid primary key default uuid_generate_v4(),
  user_subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_product_id uuid not null references public.subscription_products(id) on delete cascade,
  amount integer not null check (amount > 0),
  billing_period_start_at timestamptz not null,
  billing_period_end_at timestamptz not null,
  due_at timestamptz not null,
  payment_method text not null check (payment_method in ('points', 'balance', 'cash', 'mixed')),
  payment_status text not null check (payment_status in ('pending_cash_settlement', 'completed', 'cancelled')),
  points_used integer not null default 0 check (points_used >= 0),
  balance_used integer not null default 0 check (balance_used >= 0),
  cash_due_amount integer not null default 0 check (cash_due_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_products_is_active
  on public.subscription_products(is_active, created_at desc);

create unique index if not exists idx_user_subscriptions_active_unique
  on public.user_subscriptions(user_id, subscription_product_id)
  where status in ('active', 'cancel_at_period_end');

create index if not exists idx_user_subscriptions_user_id
  on public.user_subscriptions(user_id, created_at desc);

create index if not exists idx_user_subscriptions_product_id
  on public.user_subscriptions(subscription_product_id, created_at desc);

create index if not exists idx_user_subscriptions_due
  on public.user_subscriptions(status, next_billing_at);

create index if not exists idx_subscription_payments_user_id
  on public.subscription_payments(user_id, created_at desc);

create index if not exists idx_subscription_payments_subscription_id
  on public.subscription_payments(user_subscription_id, created_at desc);

create index if not exists idx_subscription_payments_status_due
  on public.subscription_payments(payment_status, due_at);

create trigger subscription_products_updated_at
before update on public.subscription_products
for each row execute function update_updated_at();

create trigger user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute function update_updated_at();

create trigger subscription_payments_updated_at
before update on public.subscription_payments
for each row execute function update_updated_at();

alter table public.subscription_products enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;

drop policy if exists "subscription_products_select_active" on public.subscription_products;
create policy "subscription_products_select_active"
on public.subscription_products
for select
using (is_active = true);

drop policy if exists "admin_all_subscription_products" on public.subscription_products;
create policy "admin_all_subscription_products"
on public.subscription_products
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "user_select_own_subscriptions" on public.user_subscriptions;
create policy "user_select_own_subscriptions"
on public.user_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "admin_all_user_subscriptions" on public.user_subscriptions;
create policy "admin_all_user_subscriptions"
on public.user_subscriptions
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "user_select_own_subscription_payments" on public.subscription_payments;
create policy "user_select_own_subscription_payments"
on public.subscription_payments
for select
using (auth.uid() = user_id);

drop policy if exists "admin_all_subscription_payments" on public.subscription_payments;
create policy "admin_all_subscription_payments"
on public.subscription_payments
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

alter table public.point_transactions
  add column if not exists subscription_payment_id uuid references public.subscription_payments(id) on delete set null;

create index if not exists idx_point_transactions_subscription_payment_id
  on public.point_transactions(subscription_payment_id);

alter table public.point_transactions
  drop constraint if exists point_transactions_reason_type_check;

alter table public.point_transactions
  add constraint point_transactions_reason_type_check
  check (
    reason_type in (
      'charge_reward',
      'manual_grant',
      'manual_deduct',
      'order_use',
      'order_refund',
      'charge_refund_reversal',
      'subscription_use',
      'subscription_refund'
    )
  );

alter table public.cashbox_entries
  add column if not exists subscription_payment_id uuid references public.subscription_payments(id) on delete set null;

create unique index if not exists idx_cashbox_entries_subscription_payment_unique
  on public.cashbox_entries(subscription_payment_id)
  where subscription_payment_id is not null;

alter table public.cashbox_entries
  drop constraint if exists cashbox_entries_entry_type_check;

alter table public.cashbox_entries
  add constraint cashbox_entries_entry_type_check
  check (
    entry_type in (
      'cash_order',
      'cash_charge',
      'cash_settlement',
      'manual_in',
      'manual_out',
      'misc_expense',
      'restock_cash_out',
      'advance_reimbursement',
      'cash_subscription'
    )
  );

create or replace function public.record_point_transaction(
  p_user_id uuid,
  p_delta integer,
  p_reason_type text,
  p_charge_request_id uuid default null,
  p_order_id uuid default null,
  p_note text default null,
  p_created_by uuid default null,
  p_subscription_payment_id uuid default null
)
returns integer as $$
declare
  v_user record;
  v_new_balance integer;
begin
  if p_delta = 0 then
    select points_balance
    into v_user
    from public.users
    where id = p_user_id;

    return coalesce(v_user.points_balance, 0);
  end if;

  select id, points_balance
  into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'ポイント対象ユーザーが見つかりません';
  end if;

  v_new_balance := v_user.points_balance + p_delta;

  if v_new_balance < 0 then
    raise exception 'ポイント残高が不足しています';
  end if;

  update public.users
  set points_balance = v_new_balance
  where id = p_user_id;

  insert into public.point_transactions (
    user_id,
    delta,
    balance_after,
    reason_type,
    charge_request_id,
    order_id,
    subscription_payment_id,
    note,
    created_by
  )
  values (
    p_user_id,
    p_delta,
    v_new_balance,
    p_reason_type,
    p_charge_request_id,
    p_order_id,
    p_subscription_payment_id,
    p_note,
    p_created_by
  );

  return v_new_balance;
end;
$$ language plpgsql;
