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
  };

  const { data: existing, error: readError } = await adminClient.from('users')
    .select('id, slack_user_id, slack_workspace_id, name, avatar_url, email').eq('id', authUser.id).maybeSingle();
  if (readError) {
    console.error('failed to read user profile', readError);
    return payload;
  }
  if (!existing) {
    // Preserve the established new-member policy. Never upsert approval/role over an existing user.
    const { error } = await adminClient.from('users').insert({ ...payload, is_approved: true, role: 'member' });
    if (error && error.code !== '23505') console.error('failed to create user profile', error);
    return payload;
  }
  const patch: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    if (field !== 'id' && value !== null && existing[field] !== value) patch[field] = value;
  }
  if (Object.keys(patch).length) {
    const { error } = await adminClient.from('users').update(patch).eq('id', authUser.id);
    if (error) console.error('failed to sync user profile', error);
  }
  return payload;
}

