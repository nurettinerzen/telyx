import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function buildApiUrl(pathname) {
  return new URL(pathname, API_BASE_URL).toString();
}

function buildRedirectUrl(request, pathname, params = {}) {
  const url = new URL(pathname, request.url);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;
  const cookieHeader = request.headers.get('cookie') || '';

  if (!cookieHeader) {
    return NextResponse.redirect(buildRedirectUrl(request, '/login'));
  }

  try {
    const response = await fetch(buildApiUrl('/api/auth/admin-route-state'), {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    if (response.status === 204 || response.status === 200) {
      return NextResponse.next();
    }

    if (response.status === 428) {
      return NextResponse.redirect(buildRedirectUrl(request, '/dashboard/admin-auth', {
        returnTo: `${pathname}${search}`,
      }));
    }

    if (response.status === 401) {
      return NextResponse.redirect(buildRedirectUrl(request, '/login'));
    }

    return NextResponse.redirect(buildRedirectUrl(request, '/dashboard'));
  } catch (error) {
    console.error('Admin route middleware error:', error);
    return NextResponse.redirect(buildRedirectUrl(request, '/dashboard'));
  }
}

export const config = {
  matcher: ['/dashboard/admin/:path*'],
};
