import { NextResponse } from 'next/server';

const FALLBACK_SIGNIN_URL = 'https://slack.com/signin';

export async function GET() {
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.redirect(FALLBACK_SIGNIN_URL);
  }

  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    const data = await response.json();
    const workspaceUrl = typeof data?.url === 'string' ? data.url : '';

    if (!data?.ok || !workspaceUrl) {
      return NextResponse.redirect(FALLBACK_SIGNIN_URL);
    }

    return NextResponse.redirect(workspaceUrl);
  } catch {
    return NextResponse.redirect(FALLBACK_SIGNIN_URL);
  }
}
