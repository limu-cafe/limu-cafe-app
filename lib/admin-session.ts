import { requireMemberSession } from '@/lib/member-session';
import { cookies } from 'next/headers';
import { ADMIN_PROOF_COOKIE, verifyAdminProof } from '@/lib/admin-proof';
import { cache } from 'react';

export const requireAdminSession = cache(async () => {
  const memberAccess = await requireMemberSession();
  const user = memberAccess.user;

  if (!user) {
    return { user: null, error: memberAccess.error, status: memberAccess.status };
  }

  const cookieStore = await cookies();
  if (!await verifyAdminProof(cookieStore.get(ADMIN_PROOF_COOKIE)?.value, user.id, process.env.ADMIN_PASSWORD)) {
    return { user: null, error: '管理者ログインを更新してください', status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
});

// Compatibility name; both entrypoints use the same signed management policy.
export const requireVerifiedAdminSession = requireAdminSession;
