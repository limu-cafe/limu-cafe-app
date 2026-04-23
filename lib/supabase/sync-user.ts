import { createAdminClient } from '@/lib/supabase/server';

function getWorkspaceId(user: any) {
  return (
    user?.user_metadata?.['https://slack.com/team_id'] ??
    user?.user_metadata?.team_id ??
    user?.user_metadata?.team?.id ??
    user?.user_metadata?.workspace_id ??
    user?.app_metadata?.['https://slack.com/team_id'] ??
    user?.app_metadata?.team_id ??
    user?.app_metadata?.team?.id ??
    user?.identities?.find((identity: any) => identity?.identity_data?.['https://slack.com/team_id'])
      ?.identity_data?.['https://slack.com/team_id'] ??
    user?.identities?.find((identity: any) => identity?.identity_data?.team_id)?.identity_data?.team_id ??
    user?.identities?.find((identity: any) => identity?.identity_data?.team?.id)?.identity_data?.team?.id ??
    null
  );
}

function getSlackUserId(user: any) {
  return (
    user?.user_metadata?.['https://slack.com/user_id'] ??
    user?.user_metadata?.provider_id ??
    user?.app_metadata?.['https://slack.com/user_id'] ??
    user?.identities?.find((identity: any) => identity?.identity_data?.['https://slack.com/user_id'])
      ?.identity_data?.['https://slack.com/user_id'] ??
    user?.identities?.find((identity: any) => identity?.identity_data?.provider_id)?.identity_data?.provider_id ??
    user?.identities?.[0]?.id ??
    null
  );
}

export async function syncUserProfile(authUser: any) {
  const adminClient = createAdminClient();
  const metadata = authUser?.user_metadata ?? {};

  const payload = {
    id: authUser.id,
    slack_user_id: getSlackUserId(authUser),
    slack_workspace_id: getWorkspaceId(authUser),
    name: metadata?.full_name ?? metadata?.name ?? authUser.email ?? '名無し',
    avatar_url: metadata?.avatar_url ?? null,
    email: authUser.email ?? null,
    is_approved: true,
    role: 'member' as const,
  };

  const { error } = await adminClient
    .from('users')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('failed to sync user profile', error);
  }

  return payload;
}

