import { createAdminClient } from '@/lib/supabase/server';

import { verifiedSlackIdentity } from '@/lib/slack-identity';

export async function syncUserProfile(authUser: any) {
  const identity = verifiedSlackIdentity(authUser);
  if (!identity) throw new Error('Verified Slack membership required');
  const adminClient = createAdminClient();
  const metadata = authUser?.user_metadata ?? {};

  const payload = {
    id: authUser.id,
    slack_user_id: identity.slackUserId,
    slack_workspace_id: identity.workspaceId,
    name: metadata?.full_name ?? metadata?.name ?? authUser.email ?? '名無し',
    avatar_url: metadata?.avatar_url ?? null,
    email: authUser.email ?? null,
  };

  const { data: existing, error: readError } = await adminClient.from('users')
    .select('id, slack_user_id, slack_workspace_id, name, avatar_url, email, is_active, is_approved').eq('id', authUser.id).maybeSingle();
  if (readError) {
    console.error('failed to read user profile', readError);
    throw new Error('Profile unavailable');
  }
  if (!existing) {
    // Preserve the established new-member policy. Never upsert approval/role over an existing user.
    const { error } = await adminClient.from('users').insert({ ...payload, is_approved: true, role: 'member' });
    if (error && error.code !== '23505') throw new Error('Profile creation failed');
    const { data: created, error: createReadError } = await adminClient.from('users').select('id, is_active, is_approved').eq('id', authUser.id).maybeSingle();
    if (createReadError || !created) throw new Error('Profile unavailable');
    return { ...payload, ...created };
  }
  const patch: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    if (field !== 'id' && value !== null && existing[field] !== value) patch[field] = value;
  }
  if (Object.keys(patch).length) {
    const { error } = await adminClient.from('users').update(patch).eq('id', authUser.id);
    if (error) throw new Error('Profile sync failed');
  }
  return { ...existing, ...payload };
}

