-- ============================================================
-- users テーブルの管理者ポリシー修正
-- 自己参照ポリシーによる infinite recursion を防ぐ
-- ============================================================

drop policy if exists "admin_all_users" on public.users;

create policy "admin_all_users"
on public.users
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
