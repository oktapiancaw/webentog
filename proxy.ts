import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'auth_session';
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'secret-change-me'
);
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip checks if persistence is disabled
  if (process.env.PERSISTENT_CONNECTION === 'false') {
    return NextResponse.next();
  }

  // 2. Define public paths that DON'T need a redirect
  const isPublicPath =
    pathname === '/login' || pathname.startsWith('/api/public');

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // 3. Logic: If trying to access a protected route without a valid JWT
  if (!isPublicPath) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      // VALIDATION: Actually verify the JWT signature
      await jwtVerify(sessionCookie, SECRET);
      return NextResponse.next();
    } catch (error) {
      // If JWT is expired or tampered with, clear it and redirect
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
  }

  // 4. Logic: If logged in but trying to access /login, send to dashboard/home
  if (isPublicPath && sessionCookie) {
    try {
      await jwtVerify(sessionCookie, SECRET);
      return NextResponse.redirect(new URL('/', request.url));
    } catch (e) {
      // Invalid cookie, let them stay on login page
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
