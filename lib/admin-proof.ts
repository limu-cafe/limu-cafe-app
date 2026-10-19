export const ADMIN_PROOF_COOKIE = 'limu_admin_proof';

function message(userId: string, expiry: string) {
  return new TextEncoder().encode(`limu-admin-proof:v1:${userId}:${expiry}`);
}

function key(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createAdminProof(userId: string, expiresAt: number, secret: string) {
  const signature = await crypto.subtle.sign('HMAC', await key(secret), message(userId, String(expiresAt)));
  const digest = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${expiresAt}.${digest}`;
}

export async function verifyAdminProof(proof: string | undefined, userId: string, secret: string | undefined, now = Date.now()) {
  if (!proof || !secret) return false;
  const [expiry, digest, extra] = proof.split('.');
  if (extra || !/^\d{13}$/.test(expiry) || !/^[a-f0-9]{64}$/.test(digest ?? '') || Number(expiry) <= now) return false;
  const bytes = Uint8Array.from(digest.match(/../g)!, (byte) => parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', await key(secret), bytes, message(userId, expiry));
}
