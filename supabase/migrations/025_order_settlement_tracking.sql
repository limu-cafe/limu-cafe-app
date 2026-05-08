alter table public.orders
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_source text,
  add column if not exists settlement_id uuid references public.settlements(id) on delete set null;

alter table public.orders
  drop constraint if exists orders_settlement_source_check;

alter table public.orders
  add constraint orders_settlement_source_check
  check (
    settlement_source is null
    or settlement_source in ('individual_deferred_order', 'deferred_settlement')
  );

create index if not exists idx_orders_settlement_id
  on public.orders(settlement_id)
  where settlement_id is not null;

create index if not exists idx_orders_deferred_cash_unsettled
  on public.orders(user_id, created_at)
  where payment_method = 'deferred'
    and payment_status = 'completed'
    and coalesce(deferred_settlement_method, 'cash') = 'cash'
    and settled_at is null;

with ranked_settlements as (
  select
    o.id as order_id,
    s.id as settlement_id,
    coalesce(s.settled_at, s.created_at) as settlement_at,
    row_number() over (
      partition by o.id
      order by coalesce(s.settled_at, s.created_at) asc
    ) as rn
  from public.orders o
  join public.settlements s
    on s.user_id = o.user_id
   and s.status = 'completed'
   and o.payment_method = 'deferred'
   and o.payment_status = 'completed'
   and coalesce(o.deferred_settlement_method, 'cash') = 'cash'
   and o.created_at >= (s.period_start::timestamptz)
   and o.created_at < ((s.period_end::timestamptz) + interval '1 day')
  where o.settled_at is null
)
update public.orders o
set
  settled_at = rs.settlement_at,
  settlement_source = 'deferred_settlement',
  settlement_id = rs.settlement_id
from ranked_settlements rs
where rs.rn = 1
  and rs.order_id = o.id;
