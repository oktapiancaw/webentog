import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'secret-change-me'
);

export async function isPersistentMode() {
  return process.env.PERSISTENT_CONNECTION !== 'false';
}

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function decrypt(input: string) {
  try {
    const { payload } = await jwtVerify(input, SECRET, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (e) {
    return null;
  }
}
