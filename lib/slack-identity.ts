// Workspace IDs are identifiers, not credentials. Keep known deployments usable
// when a legacy Vercel project has not set ALLOWED_SLACK_WORKSPACE_ID yet.
const deploymentWorkspaces: Record<string, string> = {
  mtmbsvzcpmtgxzmxaekc: 'T010CD40U4A',
  dungyfclpsajthvajwej: 'T0APL4S19DJ',
};

export function allowedSlackWorkspaceId() {
  const configured = process.env.ALLOWED_SLACK_WORKSPACE_ID?.trim();
  if (configured) return configured;
  try {
    const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0];
    return deploymentWorkspaces[project] ?? null;
  } catch { return null; }
}

export function verifiedSlackIdentity(user: any) {
  const allowed = allowedSlackWorkspaceId();
  if (!allowed || !user?.id) return null;
  for (const identity of user.identities ?? []) {
    if (identity?.provider !== 'slack_oidc') continue;
    const data = identity.identity_data ?? {};
    const workspaceId = data.custom_claims?.['https://slack.com/team_id'] ?? data['https://slack.com/team_id'] ?? data.team_id;
    const slackUserId = data.provider_id ?? data['https://slack.com/user_id'] ?? data.sub;
    if (workspaceId === allowed && typeof slackUserId === 'string' && slackUserId.length > 0) {
      return { workspaceId: allowed, slackUserId };
    }
  }
  return null;
}

export function safeNextPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}
