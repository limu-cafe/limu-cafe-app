-- Membership is a server-managed profile tied to a verified Slack identity.
-- Legacy profiles may not yet have a workspace column; the server fills it from
-- the identity on their next request, never from editable user_metadata.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create function app_private.has_active_membership(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u join auth.identities i on i.user_id=u.id
    where u.id=p_user_id and u.is_active and u.is_approved
      and i.provider='slack_oidc'
      and coalesce(i.identity_data->>'provider_id',i.identity_data->>'https://slack.com/user_id',i.identity_data->>'sub')=u.slack_user_id
      and coalesce(i.identity_data->'custom_claims'->>'https://slack.com/team_id',i.identity_data->>'https://slack.com/team_id',i.identity_data->>'team_id') is not null
      and (u.slack_workspace_id is null or u.slack_workspace_id=coalesce(i.identity_data->'custom_claims'->>'https://slack.com/team_id',i.identity_data->>'https://slack.com/team_id',i.identity_data->>'team_id'))
  );
$$;
revoke all on function app_private.has_active_membership(uuid) from public,anon,authenticated;
grant execute on function app_private.has_active_membership(uuid) to service_role;

create function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.has_active_membership(auth.uid());
$$;
revoke all on function public.is_active_member() from public,anon;
grant execute on function public.is_active_member() to authenticated,service_role;

-- Restrictive policies combine with every existing ownership/administrator rule.
-- Public catalogue reads keep their existing behavior.
do $$ declare t text; begin
  foreach t in array array['users','orders','order_items','charge_requests','settlements',
    'stock_history','price_watches','settlement_reminder_settings','cashbox_entries','cashbox_counts',
    'legacy_users','legacy_purchase_history','legacy_transfer_requests','admin_audit_logs',
    'purchase_runs','purchase_run_items','point_transactions','point_settings','point_campaigns',
    'user_subscriptions','subscription_payments','item_requests','item_request_votes','item_request_comments','favorite_items'] loop
    execute format('create policy active_members_only on public.%I as restrictive for all to authenticated using ((select public.is_active_member())) with check ((select public.is_active_member()))',t);
  end loop;
end $$;

create policy member_request_starts_pending on public.item_requests
as restrictive for insert to authenticated
with check (status='pending' and admin_note is null and reviewed_by is null and reviewed_at is null);

create function app_private.lock_active_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.users where id=p_user_id for update;
  if not app_private.has_active_membership(p_user_id) then
    raise exception using errcode='42501', message='このアカウントでは利用できません';
  end if;
end;
$$;
revoke all on function app_private.lock_active_member(uuid) from public,anon,authenticated;
grant execute on function app_private.lock_active_member(uuid) to service_role;

create function app_private.guard_member_financial_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.lock_active_member(new.user_id);
  return new;
end;
$$;
revoke all on function app_private.guard_member_financial_insert() from public,anon,authenticated;

create trigger charge_member_guard before insert on public.charge_requests
for each row execute function app_private.guard_member_financial_insert();
create trigger subscription_member_guard before insert on public.user_subscriptions
for each row execute function app_private.guard_member_financial_insert();
create trigger subscription_payment_member_guard before insert on public.subscription_payments
for each row execute function app_private.guard_member_financial_insert();

create or replace function public.apply_immediate_charge_to_deferred(p_user_id uuid,p_amount integer)
returns table(new_balance integer,new_deferred_balance integer)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_amount is null or p_amount<=0 then raise exception using errcode='22023',message='チャージ金額が不正です'; end if;
  perform app_private.lock_active_member(p_user_id);
  return query update public.users set balance=balance+p_amount,deferred_balance=deferred_balance+p_amount
    where id=p_user_id returning balance,deferred_balance;
end;
$$;
revoke all on function public.apply_immediate_charge_to_deferred(uuid,integer) from public,anon,authenticated;
grant execute on function public.apply_immediate_charge_to_deferred(uuid,integer) to service_role;
