create table if not exists public.admin_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.users(id) on delete set null,
  action_type text not null,
  target_type text not null,
  target_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs(created_at desc);

create index if not exists idx_admin_audit_logs_action_type
  on public.admin_audit_logs(action_type);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admin_all_admin_audit_logs" on public.admin_audit_logs;
create policy "admin_all_admin_audit_logs"
on public.admin_audit_logs
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
