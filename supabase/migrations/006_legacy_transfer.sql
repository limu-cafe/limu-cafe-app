create table if not exists public.legacy_users (
  id uuid primary key default uuid_generate_v4(),
  source text not null default 'cafeorder-vuetify',
  legacy_user_key text not null unique,
  name text not null,
  email text,
  legacy_balance integer not null default 0,
  favorite_item_names jsonb not null default '[]'::jsonb,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  matched_user_id uuid references public.users(id) on delete set null,
  matched_by uuid references public.users(id) on delete set null,
  matched_at timestamptz,
  transferred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_legacy_users_matched_user_id
  on public.legacy_users(matched_user_id)
  where matched_user_id is not null;

create table if not exists public.legacy_purchase_history (
  id uuid primary key default uuid_generate_v4(),
  legacy_user_id uuid not null references public.legacy_users(id) on delete cascade,
  source_transaction_id text,
  purchased_at timestamptz,
  item_name text not null,
  quantity integer not null default 1,
  subtotal integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_legacy_purchase_history_user_id
  on public.legacy_purchase_history(legacy_user_id);

create table if not exists public.legacy_transfer_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  legacy_name text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'rejected')),
  matched_legacy_user_id uuid references public.legacy_users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_legacy_transfer_requests_user_id
  on public.legacy_transfer_requests(user_id);

alter table public.legacy_users enable row level security;
alter table public.legacy_purchase_history enable row level security;
alter table public.legacy_transfer_requests enable row level security;

drop policy if exists "admin_all_legacy_users" on public.legacy_users;
create policy "admin_all_legacy_users"
on public.legacy_users
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_legacy_purchase_history" on public.legacy_purchase_history;
create policy "admin_all_legacy_purchase_history"
on public.legacy_purchase_history
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "legacy_transfer_requests_select_own" on public.legacy_transfer_requests;
create policy "legacy_transfer_requests_select_own"
on public.legacy_transfer_requests
for select
using (auth.uid() = user_id);

drop policy if exists "legacy_transfer_requests_insert_own" on public.legacy_transfer_requests;
create policy "legacy_transfer_requests_insert_own"
on public.legacy_transfer_requests
for insert
with check (auth.uid() = user_id);

drop policy if exists "admin_all_legacy_transfer_requests" on public.legacy_transfer_requests;
create policy "admin_all_legacy_transfer_requests"
on public.legacy_transfer_requests
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
