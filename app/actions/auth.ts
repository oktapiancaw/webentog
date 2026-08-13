'use server';
import bcrypt from 'bcryptjs';
import { decrypt, encrypt, type SessionPayload } from '@/lib/session';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

const SESSION_COOKIE_NAME = 'auth_session';
const IS_PRESISTENT = process.env.PERSISTENT_CONNECTION === 'production';
const SESSION_DAYS = 7;

export async function loginAction(
  usernameInput: string,
  passwordInput: string
) {
  const generic = { success: false, message: 'Invalid credentials' } as const;

  try {
    const { db } = await getDb();
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', usernameInput)
      .executeTakeFirst();

    // Same message either way: distinguishing "no such user" from "wrong
    // password" hands an attacker a username oracle for free.
    if (!user) return generic;
    if (!(await bcrypt.compare(passwordInput, user.password_hash))) {
      return generic;
    }

    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const session = await encrypt({
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      expires: expires.toISOString(),
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session, {
      httpOnly: true,
      secure: IS_PRESISTENT,
      sameSite: 'lax', // Use 'lax' for same-domain, 'none' for cross-domain
      path: '/',
      expires: expires,
    });

    return { success: true };
  } catch (error) {
    console.error('Login Error:', error);
    return { success: false, message: 'Could not sign you in right now.' };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return { success: true };
}

/**
 * Whether connections and pins live in SQLite.
 *
 * Must be a server action. `lib/session.ts` reads the same env var without
 * 'use server', so a client importing it gets no inlined value and always
 * reads true.
 */
export async function getPersistentMode(): Promise<boolean> {
  return process.env.PERSISTENT_CONNECTION !== 'false';
}

/**
 * The signed-in user, or null.
 *
 * Read from the cookie on the server, never taken as an argument. Server
 * actions are ordinary HTTP endpoints, so identity passed in by a caller is
 * identity the caller chose — any signed-in user could claim `role: 'admin'`.
 *
 * Returns null in non-persistent mode: there is no users table there and no
 * server-side identity to speak of.
 */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  if (process.env.PERSISTENT_CONNECTION === 'false') return null;

  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;
  return decrypt(session);
}

export async function isAuthenticated() {
  if (process.env.PERSISTENT_CONNECTION === 'false') return true;
  return (await getCurrentUser()) !== null;
}
