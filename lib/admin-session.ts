import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_PROOF_COOKIE, verifyAdminProof } from '@/lib/admin-proof';

const ADMIN_COOKIE = 'limu_admin_auth';

export async function requireAdminSession() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return { user: null, error: 'Slack login required', status: 401 as const };
  }

  const cookieStore = await cookies();
  const adminCookie = cookieStore.get(ADMIN_COOKIE)?.value;

  if (!adminCookie) {
    return { user: null, error: 'Admin login required', status: 403 as const };
  }

  const expiresAt = Number(adminCookie);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { user: null, error: 'Admin session expired', status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
}

// New management APIs also verify the server-issued, user-bound password proof.
// The legacy expiry cookie alone is not proof of a successful password login.
export async function requireVerifiedAdminSession() {
  const session = await requireAdminSession();
  if (session.error || !session.user) return session;
  const cookieStore = await cookies();
  if (!verifyAdminProof(cookieStore.get(ADMIN_PROOF_COOKIE)?.value, session.user.id, process.env.ADMIN_PASSWORD)) {
    return { user: null, error: '管理者ログインを更新してください', status: 403 as const };
  }
  return session;
}
