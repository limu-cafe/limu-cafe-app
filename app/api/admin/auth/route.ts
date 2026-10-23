import { requireMemberSession } from '@/lib/member-session';
import { NextResponse } from 'next/server';
import { ADMIN_PROOF_COOKIE, createAdminProof } from '@/lib/admin-proof';

const ADMIN_COOKIE = 'limu_admin_auth';
const ADMIN_SESSION_DURATION = 8 * 60 * 60;

export async function POST(request: Request) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const memberAccess = await requireMemberSession();
  const user = memberAccess.user;

  if (!adminPassword) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: memberAccess.error }, { status: memberAccess.status });
  }

  if (password === adminPassword) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_PROOF_COOKIE, await createAdminProof(user.id, Date.now() + ADMIN_SESSION_DURATION * 1000, adminPassword), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ADMIN_SESSION_DURATION,
    });
    response.cookies.set(ADMIN_COOKIE, String(Date.now() + ADMIN_SESSION_DURATION * 1000), {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ADMIN_SESSION_DURATION,
    });
    return response;
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}

export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_PROOF_COOKIE, '', { path: '/', httpOnly: true, maxAge: 0 });
  response.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
