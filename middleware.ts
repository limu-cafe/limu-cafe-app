import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const USER_PROTECTED_PATHS = ['/', '/mypage', '/request', '/charge', '/cart', '/checkout', '/pending', '/order-complete'];
const ADMIN_PROTECTED_PREFIX = '/admin';
const ADMIN_LOGIN_PATH = '/admin/login';
const LOGIN_PATH = '/login';
const ADMIN_COOKIE = 'limu_admin_auth';

function isUserProtectedPath(pathname: string) {
  return USER_PROTECTED_PATHS.includes(pathname);
}

function isAdminProtectedPath(pathname: string) {
  return pathname.startsWith(ADMIN_PROTECTED_PREFIX) && pathname !== ADMIN_LOGIN_PATH;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && isUserProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.search = '';
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (!user && isAdminProtectedPath(pathname)) {
    const adminLoginUrl = request.nextUrl.clone();
    adminLoginUrl.pathname = ADMIN_LOGIN_PATH;
    adminLoginUrl.search = '';
    adminLoginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(adminLoginUrl);
  }

  if (user && isAdminProtectedPath(pathname)) {
    const adminCookie = request.cookies.get(ADMIN_COOKIE)?.value;
    const adminExpiry = adminCookie ? Number(adminCookie) : 0;
    if (!adminExpiry || Date.now() >= adminExpiry) {
      const adminLoginUrl = request.nextUrl.clone();
      adminLoginUrl.pathname = ADMIN_LOGIN_PATH;
      adminLoginUrl.search = '';
      adminLoginUrl.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(adminLoginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
