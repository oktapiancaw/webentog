import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'auth_session';
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'secret-change-me'
);

/**
 * A correctly signed cookie is not automatically a usable one.
 *
 * Sessions issued before users existed carry `{ user, expires }` and no
 * userId. Those verify fine, so signature-only checking would wave them
 * through to an app where every action then fails with "You are not signed
 * in." Treating them as no session sends people to the login page instead,
 * which is a thing they can act on.
 */
async function readSession(token: string) {
  const { payload } = await jwtVerify(token, SECRET);
  if (typeof payload.userId !== 'number' || typeof payload.role !== 'string') {
    throw new Error('Session predates user accounts.');
  }
  return payload;
}
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
      // VALIDATION: verify the signature and that the payload is a session
      // this build understands.
      await readSession(sessionCookie);
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
      await readSession(sessionCookie);
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
