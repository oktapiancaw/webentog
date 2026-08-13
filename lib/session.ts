import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@/lib/db/types';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'secret-change-me'
);

/**
 * What the session cookie carries. `role` is in here so an admin check costs
 * no database round trip — the tradeoff is that a role change only takes
 * effect on the user's next login, which is why deleting or demoting a user
 * is checked again server-side wherever it actually matters.
 */
export interface SessionPayload {
  userId: number;
  username: string;
  /** Display name, null when the user has not been given one. */
  fullName: string | null;
  role: UserRole;
  expires: string;
  [key: string]: unknown; // jose's JWTPayload index signature
}

export async function encrypt(payload: SessionPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function decrypt(input: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(input, SECRET, {
      algorithms: ['HS256'],
    });
    // A cookie signed before roles existed has no userId. Treat it as no
    // session rather than as a user with an undefined id.
    if (
      typeof payload.userId !== 'number' ||
      typeof payload.role !== 'string'
    ) {
      return null;
    }
    // fullName arrived after userId and role did, so a cookie issued between
    // the two is missing it. Defaulting rather than rejecting means adding a
    // display field does not sign everybody out on deploy.
    return {
      userId: payload.userId,
      username: String(payload.username ?? ''),
      fullName:
        typeof payload.fullName === 'string' && payload.fullName
          ? payload.fullName
          : null,
      role: payload.role as UserRole,
      expires: String(payload.expires ?? ''),
    };
  } catch {
    return null;
  }
}
