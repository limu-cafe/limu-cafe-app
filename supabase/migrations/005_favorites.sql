create table if not exists public.favorite_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create index if not exists idx_favorite_items_user_id on public.favorite_items(user_id);
create index if not exists idx_favorite_items_item_id on public.favorite_items(item_id);

alter table public.favorite_items enable row level security;

drop policy if exists "favorite_items_select_own" on public.favorite_items;
create policy "favorite_items_select_own"
on public.favorite_items
for select
using (auth.uid() = user_id);

drop policy if exists "favorite_items_insert_own" on public.favorite_items;
create policy "favorite_items_insert_own"
on public.favorite_items
for insert
with check (auth.uid() = user_id);

drop policy if exists "favorite_items_delete_own" on public.favorite_items;
create policy "favorite_items_delete_own"
on public.favorite_items
for delete
using (auth.uid() = user_id);

drop policy if exists "admin_all_favorite_items" on public.favorite_items;
create policy "admin_all_favorite_items"
on public.favorite_items
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
