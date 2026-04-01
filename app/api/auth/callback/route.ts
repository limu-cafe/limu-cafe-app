import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const redirectPath = next && next.startsWith('/') ? next : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error && data.user) {
    const adminClient = createAdminClient();
    const { data: existing } = await adminClient
      .from('users').select('id').eq('id', data.user.id).single();

    if (!existing) {
      const m = data.user.user_metadata;
      await adminClient.from('users').insert({
        id: data.user.id,
        slack_user_id: m?.provider_id ?? null,
        slack_workspace_id: m?.team_id ?? null,
        name: m?.full_name ?? m?.name ?? data.user.email ?? '名無し',
        avatar_url: m?.avatar_url ?? null,
        email: data.user.email,
        is_approved: true,
        role: 'member',
      });
    }

    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
