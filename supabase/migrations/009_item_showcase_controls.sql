alter table public.items
  add column if not exists popular_override text not null default 'auto'
    check (popular_override in ('auto', 'show', 'hide')),
  add column if not exists new_arrival_override text not null default 'auto'
    check (new_arrival_override in ('auto', 'show', 'hide'));
