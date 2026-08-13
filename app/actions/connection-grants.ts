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

import { getCurrentUser } from './auth';
import { getDb, insertAndGetId, isUniqueViolation } from '@/lib/db';
import { attempt, type ActionResult } from '@/lib/action-result';

export interface Grant {
  userId: number;
  username: string;
}

/**
 * Admin-only, and the identity comes from the cookie rather than an argument
 * for the same reason it does in `users.ts`: a server action is reachable
 * without the UI.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in.');
  if (user.role !== 'admin') {
    throw new Error('Only an admin can manage connection access.');
  }
  return user;
}

/**
 * Gives `userId` the same access to the connection that its owner has. There
 * are no permission tiers — a grant is all-or-nothing.
 */
export async function grantAccess(
  connectionId: number,
  userId: number
): Promise<ActionResult<{ id: number }>> {
  return attempt('Grant Access Error', 'Could not grant access.', async () => {
    await requireAdmin();
    const { db, type } = await getDb();

    const connection = await db
      .selectFrom('connections')
      .select('owner_id')
      .where('id', '=', connectionId)
      .executeTakeFirst();
    if (!connection) throw new Error('That connection no longer exists.');
    if (connection.owner_id === userId) {
      throw new Error('That user already owns this connection.');
    }

    const user = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) throw new Error('That user no longer exists.');

    try {
      const id = await insertAndGetId(
        db
          .insertInto('connection_grants')
          .values({ connection_id: connectionId, user_id: userId }),
        type
      );
      return { id };
    } catch (error) {
      // Already granted: re-granting is a no-op, matching how re-pinning behaves.
      if (isUniqueViolation(error, type)) {
        const existing = await db
          .selectFrom('connection_grants')
          .select('id')
          .where('connection_id', '=', connectionId)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (existing) return { id: existing.id };
      }
      throw error;
    }
  });
}

/**
 * Removes the grant. The user's pins on that connection are deliberately left
 * alone: they did not do anything, and a re-grant should find their bookmarks
 * where they left them.
 */
export async function revokeAccess(
  connectionId: number,
  userId: number
): Promise<ActionResult<true>> {
  return attempt(
    'Revoke Access Error',
    'Could not revoke access.',
    async () => {
      await requireAdmin();
      const { db } = await getDb();
      await db
        .deleteFrom('connection_grants')
        .where('connection_id', '=', connectionId)
        .where('user_id', '=', userId)
        .execute();
      return true as const;
    }
  );
}

export async function listGrants(connectionId: number): Promise<Grant[]> {
  await requireAdmin();
  const { db } = await getDb();
  const rows = await db
    .selectFrom('connection_grants')
    .innerJoin('users', 'users.id', 'connection_grants.user_id')
    .select(['users.id as userId', 'users.username as username'])
    .where('connection_grants.connection_id', '=', connectionId)
    .orderBy('users.username', 'asc')
    .execute();
  return rows;
}
