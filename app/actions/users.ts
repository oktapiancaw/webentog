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
'use server';

import bcrypt from 'bcryptjs';
import { getCurrentUser } from './auth';
import { getDb, insertAndGetId, isUniqueViolation } from '@/lib/db';
import { BCRYPT_ROUNDS } from '@/lib/db/seed';
import type { UserRole } from '@/lib/db/types';
import {
  validateUsername,
  validatePassword,
  validateFullName,
} from '@/lib/users';
import { attempt, type ActionResult } from '@/lib/action-result';

export interface PublicUser {
  id: number;
  username: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  /**
   * Names of connections granted to this user. Connections they own are not
   * in here — those are theirs already, not access somebody handed them.
   */
  grantedConnections: string[];
}

/**
 * Every action in this file is admin-only, and every one of them re-derives
 * who is asking from the session cookie.
 *
 * Server actions are ordinary HTTP endpoints. Taking the caller's identity as
 * an argument would let any signed-in user hand in `role: 'admin'`, so the
 * check has to start from the cookie, server-side, on each call.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in.');
  if (user.role !== 'admin') {
    throw new Error('Only an admin can manage users.');
  }
  return user;
}

export async function listUsers(): Promise<PublicUser[]> {
  await requireAdmin();
  const { db } = await getDb();
  const rows = await db
    .selectFrom('users')
    // password_hash is never selected: it has no business leaving the server,
    // and a client component would serialise it straight into the payload.
    .select(['id', 'username', 'full_name', 'role', 'created_at'])
    .orderBy('username', 'asc')
    .execute();

  // One query for every grant, grouped in memory, rather than one per user.
  const grants = await db
    .selectFrom('connection_grants')
    .innerJoin(
      'connections',
      'connections.id',
      'connection_grants.connection_id'
    )
    .select([
      'connection_grants.user_id as user_id',
      'connections.name as name',
    ])
    .orderBy('connections.name', 'asc')
    .execute();

  const byUser = new Map<number, string[]>();
  for (const g of grants) {
    byUser.set(g.user_id, [...(byUser.get(g.user_id) ?? []), g.name]);
  }

  return rows.map((r) => ({
    ...r,
    created_at: String(r.created_at),
    grantedConnections: byUser.get(r.id) ?? [],
  }));
}

export async function createUser(
  username: string,
  password: string,
  role: UserRole,
  fullName = ''
): Promise<ActionResult<{ id: number }>> {
  return attempt(
    'Create User Error',
    'Could not create that user.',
    async () => {
      await requireAdmin();

      const name = username.trim();
      const invalid =
        validateUsername(name) ??
        validatePassword(password) ??
        validateFullName(fullName);
      if (invalid) throw new Error(invalid);
      if (role !== 'admin' && role !== 'user') throw new Error('Unknown role.');

      const { db, type } = await getDb();
      try {
        const id = await insertAndGetId(
          db.insertInto('users').values({
            username: name,
            full_name: fullName.trim() || null,
            password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
            role,
          }),
          type
        );
        return { id };
      } catch (error) {
        if (isUniqueViolation(error, type)) {
          throw new Error(`A user named "${name}" already exists.`);
        }
        throw error;
      }
    }
  );
}

export async function updateUser(
  id: number,
  updates: {
    username?: string;
    password?: string;
    role?: UserRole;
    fullName?: string;
  }
): Promise<ActionResult<true>> {
  return attempt(
    'Update User Error',
    'Could not update that user.',
    async () => {
      const admin = await requireAdmin();
      const { db, type } = await getDb();

      const patch: {
        username?: string;
        full_name?: string | null;
        password_hash?: string;
        role?: UserRole;
      } = {};

      if (updates.username !== undefined) {
        const name = updates.username.trim();
        const invalid = validateUsername(name);
        if (invalid) throw new Error(invalid);
        patch.username = name;
      }
      if (updates.fullName !== undefined) {
        const invalid = validateFullName(updates.fullName);
        if (invalid) throw new Error(invalid);
        // Clearing the field stores null, not '', so "not set" has one shape.
        patch.full_name = updates.fullName.trim() || null;
      }
      if (updates.password !== undefined && updates.password !== '') {
        const invalid = validatePassword(updates.password);
        if (invalid) throw new Error(invalid);
        patch.password_hash = await bcrypt.hash(
          updates.password,
          BCRYPT_ROUNDS
        );
      }
      if (updates.role !== undefined) {
        if (updates.role !== 'admin' && updates.role !== 'user') {
          throw new Error('Unknown role.');
        }
        // Demoting yourself while you are the only admin locks everyone out of
        // user management with no way back in.
        if (updates.role !== 'admin' && id === admin.userId) {
          await assertNotLastAdmin(id);
        }
        patch.role = updates.role;
      }

      if (Object.keys(patch).length === 0) return true as const;

      try {
        const result = await db
          .updateTable('users')
          .set(patch)
          .where('id', '=', id)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) {
          throw new Error('That user no longer exists.');
        }
        return true as const;
      } catch (error) {
        if (isUniqueViolation(error, type)) {
          throw new Error(`A user named "${patch.username}" already exists.`);
        }
        throw error;
      }
    }
  );
}

export async function deleteUser(id: number): Promise<ActionResult<true>> {
  return attempt(
    'Delete User Error',
    'Could not delete that user.',
    async () => {
      const admin = await requireAdmin();

      // Deleting the account you are signed in as leaves a valid cookie pointing
      // at a row that is gone. Another admin can do it; you cannot do it to
      // yourself.
      if (id === admin.userId) {
        throw new Error('You cannot delete the account you are signed in as.');
      }
      await assertNotLastAdmin(id);

      const { db } = await getDb();
      // No foreign keys in this schema, so the cascade is by hand — same as the
      // pin cleanup on folder delete.
      await db
        .deleteFrom('connection_grants')
        .where('user_id', '=', id)
        .execute();
      await db.deleteFrom('pinned_folders').where('user_id', '=', id).execute();
      // Connections they owned are left in place, reassigned to the acting admin.
      // Deleting them would take a bucket's saved credentials with it on what
      // reads as a user-management action.
      await db
        .updateTable('connections')
        .set({ owner_id: admin.userId })
        .where('owner_id', '=', id)
        .execute();
      await db.deleteFrom('users').where('id', '=', id).execute();
      return true as const;
    }
  );
}

/** Throws if removing or demoting `id` would leave no admin at all. */
async function assertNotLastAdmin(id: number): Promise<void> {
  const { db } = await getDb();
  const target = await db
    .selectFrom('users')
    .select('role')
    .where('id', '=', id)
    .executeTakeFirst();
  if (target?.role !== 'admin') return;

  const others = await db
    .selectFrom('users')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('role', '=', 'admin')
    .where('id', '!=', id)
    .executeTakeFirst();

  if (Number(others?.n ?? 0) === 0) {
    throw new Error('Cannot remove the last remaining admin.');
  }
}
