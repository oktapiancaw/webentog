'use server';
import { decrypt, encrypt } from '@/lib/session';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'auth_session';
const IS_PRESISTENT = process.env.PERSISTENT_CONNECTION === 'production';

/**
 * Actions
 */
export async function loginAction(
  usernameInput: string,
  passwordInput: string
) {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (usernameInput === adminUsername && passwordInput === adminPassword) {
    // Create the JWT session
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await encrypt({ user: adminUsername, expires });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session, {
      httpOnly: true,
      secure: IS_PRESISTENT,
      sameSite: 'lax', // Use 'lax' for same-domain, 'none' for cross-domain
      path: '/',
      expires: expires,
    });

    return { success: true };
  }

  return { success: false, message: 'Invalid credentials' };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return { success: true };
}

export async function isAuthenticated() {
  if (process.env.PERSISTENT_CONNECTION === 'false') return true;

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!session) return false;

  const parsed = await decrypt(session);
  return !!parsed; // Returns true if JWT is valid and not expired
}
