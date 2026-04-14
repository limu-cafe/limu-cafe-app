alter table public.orders
add column if not exists deferred_settlement_method text
check (deferred_settlement_method in ('cash', 'stripe'));
