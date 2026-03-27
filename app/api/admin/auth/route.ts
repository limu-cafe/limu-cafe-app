import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (password === adminPassword) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}
