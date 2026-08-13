// Copyright (C) 2026 Oktapiancaw

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import bcrypt from 'bcryptjs';
import { Kysely } from 'kysely';
import type { DbType } from './config';
import type { Database } from './types';

export const BCRYPT_ROUNDS = 10;

/** Matches the defaults the login page has always shipped with. */
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

/**
 * Makes sure the env-configured admin exists as a real row, and returns its id.
 *
 * Runs once per process, from the same init path as the schema bootstrap. The
 * password hash is re-synced every boot on purpose: ADMIN_PASSWORD is still
 * the way an operator sets the admin password, so rotating it in the
 * environment has to actually change the login, not silently do nothing.
 *
 * The cost of that: a password changed through the admin UI is overwritten on
 * the next restart if ADMIN_PASSWORD is still set. That is the same
 * env-is-the-source-of-truth behaviour this app had before there was a users
 * table at all, and it only applies to the seeded admin.
 */
export async function seedAdmin(
  db: Kysely<Database>,
  type: DbType
): Promise<number> {
  const username = process.env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  const existing = await db
    .selectFrom('users')
    .select(['id', 'role', 'password_hash'])
    .where('username', '=', username)
    .executeTakeFirst();

  if (existing) {
    const changed = !(await bcrypt.compare(password, existing.password_hash));
    // Only write when something actually differs — otherwise every boot burns
    // a bcrypt hash and an UPDATE for nothing.
    if (changed || existing.role !== 'admin') {
      await db
        .updateTable('users')
        .set({
          role: 'admin',
          ...(changed
            ? { password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS) }
            : {}),
        })
        .where('id', '=', existing.id)
        .execute();
    }
    return existing.id;
  }

  const values = {
    username,
    password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: 'admin' as const,
  };

  if (type === 'mysql') {
    const result = await db
      .insertInto('users')
      .values(values)
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }
  const row = await db
    .insertInto('users')
    .values(values)
    .returning('id')
    .executeTakeFirstOrThrow();
  return Number(row.id);
}
