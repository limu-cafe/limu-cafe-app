create table if not exists public.purchase_runs (
  id uuid primary key default uuid_generate_v4(),
  total_amount integer not null check (total_amount > 0),
  payment_source text not null check (payment_source in ('cashbox', 'personal_advance')),
  reimbursement_status text not null check (
    reimbursement_status in ('not_needed', 'pending_reimbursement', 'reimbursed')
  ),
  vendor text,
  note text,
  purchased_by uuid references public.users(id) on delete set null,
  reimbursed_by uuid references public.users(id) on delete set null,
  reimbursed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_run_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_run_id uuid not null references public.purchase_runs(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  subtotal integer not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_runs_created_at
  on public.purchase_runs(created_at desc);

create index if not exists idx_purchase_runs_reimbursement_status
  on public.purchase_runs(reimbursement_status);

create index if not exists idx_purchase_run_items_purchase_run_id
  on public.purchase_run_items(purchase_run_id);

alter table public.purchase_runs enable row level security;
alter table public.purchase_run_items enable row level security;

drop policy if exists "admin_all_purchase_runs" on public.purchase_runs;
create policy "admin_all_purchase_runs"
on public.purchase_runs
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_purchase_run_items" on public.purchase_run_items;
create policy "admin_all_purchase_run_items"
on public.purchase_run_items
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

alter table public.cashbox_entries
  add column if not exists purchase_run_id uuid references public.purchase_runs(id) on delete set null;

drop index if exists idx_cashbox_entries_purchase_run_type_unique;
create unique index if not exists idx_cashbox_entries_purchase_run_type_unique
  on public.cashbox_entries(purchase_run_id, entry_type)
  where purchase_run_id is not null;

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
      'restock_cash_out',
      'advance_reimbursement'
    )
  );
