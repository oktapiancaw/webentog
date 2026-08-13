// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import { decrypt } from '../../lib/session.ts';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'secret-change-me'
);

const sign = (payload: Record<string, unknown>) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET);

test('a current session decodes whole', async () => {
  const token = await sign({
    userId: 7,
    username: 'okta',
    fullName: 'Oktapian Candra',
    role: 'admin',
    expires: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(await decrypt(token), {
    userId: 7,
    username: 'okta',
    fullName: 'Oktapian Candra',
    role: 'admin',
    expires: '2026-01-01T00:00:00.000Z',
  });
});

test('a cookie issued before fullName existed still signs in', async () => {
  // The upgrade case that matters: adding a display field must not invalidate
  // every session in flight and sign everyone out on deploy.
  const token = await sign({
    userId: 7,
    username: 'okta',
    role: 'user',
    expires: 'x',
  });
  const session = await decrypt(token);
  assert.equal(session?.userId, 7);
  assert.equal(session?.fullName, null);
});

test('an empty fullName normalises to null', async () => {
  // One representation of "not set", matching what the column stores.
  const token = await sign({
    userId: 1,
    username: 'a',
    fullName: '',
    role: 'user',
    expires: 'x',
  });
  assert.equal((await decrypt(token))?.fullName, null);
});

test('a session predating user accounts is refused', async () => {
  // `{ user, expires }` verifies fine but has no userId, so it would reach an
  // app where every action fails "You are not signed in."
  assert.equal(
    await decrypt(await sign({ user: 'admin', expires: 'x' })),
    null
  );
});

test('a tampered or foreign-signed token is refused', async () => {
  const foreign = await new SignJWT({ userId: 1, username: 'x', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('a-different-secret'));
  assert.equal(await decrypt(foreign), null);
  assert.equal(await decrypt('not-a-jwt'), null);
});
