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

import type { Kysely } from 'kysely';
import { getDb } from '@/lib/db';
import type { DbType } from '@/lib/db/config';
import { pinnedValue } from '@/lib/db/dialect';
import type { Database } from '@/lib/db/types';
import { getCurrentUser } from './auth';
import { attempt, type ActionResult } from '@/lib/action-result';
import { MAX_PINNED_CONNECTIONS } from '@/lib/utils';

/**
 * The signed-in user, or a thrown error.
 *
 * A copy of object-management's own guard rather than an import: that one
 * lives in a `'use server'` module, where every export has to be an async
 * server action, so a shared helper cannot be exported from it.
 */
async function requireUserId(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in.');
  return user.userId;
}

/**
 * Insert-or-update one (user, connection) preference row.
 *
 * Branches on existence instead of using an upsert: `ON CONFLICT` and
 * `ON DUPLICATE KEY UPDATE` are spelled differently across the three engines
 * this app supports, and a wrong guess fails only on the engine nobody tested.
 */
async function upsertPref(
  db: Kysely<Database>,
  type: DbType,
  userId: number,
  connectionId: number,
  values: { pinned?: boolean; sort_order?: number }
): Promise<void> {
  // Only bind `pinned` when the caller actually set it: a reorder must not
  // reset the pin, and an undefined here would write one.
  const set = {
    ...(values.pinned === undefined
      ? {}
      : { pinned: pinnedValue(type, values.pinned) }),
    ...(values.sort_order === undefined
      ? {}
      : { sort_order: values.sort_order }),
  };
  const existing = await db
    .selectFrom('connection_prefs')
    .select('id')
    .where('user_id', '=', userId)
    .where('connection_id', '=', connectionId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('connection_prefs')
      .set(set)
      .where('id', '=', existing.id)
      .execute();
    return;
  }

  await db
    .insertInto('connection_prefs')
    .values({
      user_id: userId,
      connection_id: connectionId,
      pinned: pinnedValue(type, values.pinned ?? false),
      sort_order: values.sort_order ?? 0,
    })
    .execute();
}

/**
 * Records the order of one group of connections for the signed-in user.
 *
 * `orderedIds` is one group's ids — pinned or unpinned — so reordering one
 * leaves the other's positions alone.
 *
 * Sequential writes rather than one bulk statement: the list is a handful of
 * rows, and a portable bulk upsert across sqlite/postgres/mysql costs more
 * complexity than it saves here.
 */
export async function reorderConnections(
  orderedIds: number[]
): Promise<ActionResult<true>> {
  return attempt(
    'Reorder Connections Error',
    'Could not save that order.',
    async () => {
      const userId = await requireUserId();
      const { db, type } = await getDb();
      for (const [index, connectionId] of orderedIds.entries()) {
        await upsertPref(db, type, userId, connectionId, { sort_order: index });
      }
      return true as const;
    }
  );
}

/**
 * Pins or unpins a connection for the signed-in user.
 *
 * A fourth pin is refused rather than silently evicting the oldest — the user
 * picked those three, and quietly dropping one is the kind of invisible
 * destructive act this app avoids everywhere else.
 */
export async function toggleConnectionPin(
  connectionId: number,
  pinned: boolean
): Promise<ActionResult<true>> {
  return attempt(
    'Pin Connection Error',
    'Could not update that pin.',
    async () => {
      const userId = await requireUserId();
      const { db, type } = await getDb();

      if (pinned) {
        const current = await db
          .selectFrom('connection_prefs')
          .select('id')
          .where('user_id', '=', userId)
          .where('pinned', '=', pinnedValue(type, true))
          .where('connection_id', '!=', connectionId)
          .execute();
        if (current.length >= MAX_PINNED_CONNECTIONS) {
          throw new Error(
            `You can only pin up to ${MAX_PINNED_CONNECTIONS} connections. Unpin one first.`
          );
        }
      }

      await upsertPref(db, type, userId, connectionId, { pinned });
      return true as const;
    }
  );
}
