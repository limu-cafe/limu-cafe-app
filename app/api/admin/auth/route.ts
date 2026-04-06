import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_COOKIE = 'limu_admin_auth';
const ADMIN_SESSION_DURATION = 8 * 60 * 60;

export async function POST(request: Request) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!adminPassword) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: 'Slack login required' }, { status: 401 });
  }

  if (password === adminPassword) {
    const response = NextResponse.json({ ok: true });
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
