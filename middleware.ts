import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_PROOF_COOKIE, verifyAdminProof } from '@/lib/admin-proof';
import { isManagementApi } from '@/lib/admin-access';

const USER_PROTECTED_PATHS = ['/', '/mypage', '/request', '/charge', '/cart', '/checkout', '/pending', '/order-complete'];
const ADMIN_PROTECTED_PREFIX = '/admin';
const ADMIN_LOGIN_PATH = '/admin/login';
const ADMIN_PASSWORD_PATH = '/admin/password';
const LOGIN_PATH = '/login';

function isUserProtectedPath(pathname: string) {
  return USER_PROTECTED_PATHS.includes(pathname);
}

function isAdminProtectedPath(pathname: string) {
  return pathname.startsWith(ADMIN_PROTECTED_PREFIX) && pathname !== ADMIN_LOGIN_PATH && pathname !== ADMIN_PASSWORD_PATH;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const managementApi = isManagementApi(pathname, request.method);
  if (pathname.startsWith('/api/') && !managementApi) return NextResponse.next();
  const protectedAdminPath = isAdminProtectedPath(pathname) || managementApi;

  const redirectToLogin = () => {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.search = '';
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  };

  const redirectToAdminLogin = () => {
    if (managementApi) return NextResponse.json({ error: '管理者ログインを更新してください' }, { status: 403 });
    const adminLoginUrl = request.nextUrl.clone();
    adminLoginUrl.pathname = ADMIN_LOGIN_PATH;
    adminLoginUrl.search = '';
    adminLoginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(adminLoginUrl);
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (protectedAdminPath) {
      return redirectToAdminLogin();
    }
    if (isUserProtectedPath(pathname)) {
      return redirectToLogin();
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  let user = null;

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
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
      data: { user: sessionUser },
    } = await supabase.auth.getUser();

    user = sessionUser;
  } catch (error) {
    console.error('middleware auth check failed', error);
    if (protectedAdminPath) {
      return redirectToAdminLogin();
    }
    if (isUserProtectedPath(pathname)) {
      return redirectToLogin();
    }
    return response;
  }

  if (!user && isUserProtectedPath(pathname)) {
    return redirectToLogin();
  }

  if (!user && protectedAdminPath) {
    return redirectToAdminLogin();
  }

  if (!user && pathname === ADMIN_PASSWORD_PATH) {
    return redirectToAdminLogin();
  }

  if (user && protectedAdminPath) {
    if (!await verifyAdminProof(request.cookies.get(ADMIN_PROOF_COOKIE)?.value, user.id, process.env.ADMIN_PASSWORD)) {
      return redirectToAdminLogin();
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
