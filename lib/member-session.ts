import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import { verifiedSlackIdentity } from '@/lib/slack-identity';

export const requireMemberSession = cache(async () => {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { user: null, error: 'Unauthorized', status: 401 as const };
  if (!verifiedSlackIdentity(user)) return { user: null, error: '許可されたSlackワークスペースでログインしてください', status: 403 as const };
  try {
    const profile = await syncUserProfile(user);
    if (!profile.is_active || !profile.is_approved) {
      return { user: null, error: 'このアカウントでは利用できません。管理者に確認してください', status: 403 as const };
    }
    return { user, profile, error: null, status: 200 as const };
  } catch {
    return { user: null, error: 'アカウントを確認できませんでした', status: 503 as const };
  }
});

export async function requireMemberPage() {
  return (await requireMemberPageSession()).user;
}

// Reuse the profile already checked by the member guard in this server render.
// This is not a persistent cache: a later request checks account status again.
export async function requireMemberPageSession() {
  const access = await requireMemberSession();
  if (!access.user) redirect(access.status === 401 ? '/login' : '/login?error=access_denied');
  return access;
}
