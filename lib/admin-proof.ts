import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_PROOF_COOKIE = 'limu_admin_proof';

function signature(userId: string, expiry: string, secret: string) {
  return createHmac('sha256', secret).update(`limu-admin-proof:v1:${userId}:${expiry}`).digest('hex');
}

export function createAdminProof(userId: string, expiresAt: number, secret: string) {
  return `${expiresAt}.${signature(userId, String(expiresAt), secret)}`;
}

export function verifyAdminProof(proof: string | undefined, userId: string, secret: string | undefined, now = Date.now()) {
  if (!proof || !secret) return false;
  const [expiry, digest, extra] = proof.split('.');
  if (extra || !/^\d{13}$/.test(expiry) || !/^[a-f0-9]{64}$/.test(digest ?? '') || Number(expiry) <= now) return false;
  return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature(userId, expiry, secret), 'hex'));
}
