-- ============================================================
-- 要望の投票・コメント機能
-- ============================================================

-- 要望はログイン済みユーザー全員が見られるようにする
drop policy if exists "item_req_select_own" on public.item_requests;
create policy "item_req_select_all_authenticated"
on public.item_requests
for select
using (auth.uid() is not null);

create table if not exists public.item_request_votes (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.item_requests(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote_type text not null default 'up'
    check (vote_type in ('up')),
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create index if not exists idx_item_request_votes_request_id
  on public.item_request_votes(request_id);

create table if not exists public.item_request_comments (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.item_requests(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  source text not null default 'app'
    check (source in ('app', 'slack')),
  created_at timestamptz not null default now()
);

create index if not exists idx_item_request_comments_request_id
  on public.item_request_comments(request_id, created_at);

alter table public.item_request_votes enable row level security;
alter table public.item_request_comments enable row level security;

drop policy if exists "item_request_votes_select_all_authenticated" on public.item_request_votes;
create policy "item_request_votes_select_all_authenticated"
on public.item_request_votes
for select
using (auth.uid() is not null);

drop policy if exists "item_request_votes_insert_own" on public.item_request_votes;
create policy "item_request_votes_insert_own"
on public.item_request_votes
for insert
with check (auth.uid() = user_id);

drop policy if exists "item_request_votes_delete_own" on public.item_request_votes;
create policy "item_request_votes_delete_own"
on public.item_request_votes
for delete
using (auth.uid() = user_id);

drop policy if exists "admin_all_item_request_votes" on public.item_request_votes;
create policy "admin_all_item_request_votes"
on public.item_request_votes
for all
using (public.is_admin(auth.uid()));

drop policy if exists "item_request_comments_select_all_authenticated" on public.item_request_comments;
create policy "item_request_comments_select_all_authenticated"
on public.item_request_comments
for select
using (auth.uid() is not null);

drop policy if exists "item_request_comments_insert_own" on public.item_request_comments;
create policy "item_request_comments_insert_own"
on public.item_request_comments
for insert
with check (auth.uid() = user_id);

drop policy if exists "item_request_comments_update_own" on public.item_request_comments;
create policy "item_request_comments_update_own"
on public.item_request_comments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "item_request_comments_delete_own" on public.item_request_comments;
create policy "item_request_comments_delete_own"
on public.item_request_comments
for delete
using (auth.uid() = user_id);

drop policy if exists "admin_all_item_request_comments" on public.item_request_comments;
create policy "admin_all_item_request_comments"
on public.item_request_comments
for all
using (public.is_admin(auth.uid()));
