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

import { getOperator } from '@/lib/opendal';
import { getCurrentUser } from './auth';
import { attempt, type ActionResult } from '@/lib/action-result';
import { getDb, insertAndGetId, isUniqueViolation } from '@/lib/db';
import type { ConnectionConfig } from './object-management';

export interface PinnedFolder {
  id: number;
  connection_id: number;
  /** Raw S3 key, never the display endpoint/bucket/key string. */
  path: string;
  created_at: string;
}

export interface ValidatedPinnedFolder extends PinnedFolder {
  exists: boolean;
}

/**
 * The signed-in user's id, for scoping pins.
 *
 * Read from the cookie rather than taken as an argument: a caller-supplied id
 * would let any signed-in user read or delete somebody else's bookmarks.
 * Non-persistent mode has no users at all, so pins there share id 0 exactly as
 * they shared one list before.
 */
async function currentUserId(): Promise<number> {
  if (process.env.PERSISTENT_CONNECTION === 'false') return 0;
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in.');
  return user.userId;
}

export async function pinFolder(
  connectionId: number,
  path: string
): Promise<ActionResult<{ id: number }>> {
  return attempt('Pin Folder Error', 'Could not pin that folder.', async () => {
    const userId = await currentUserId();
    const { db, type } = await getDb();
    try {
      const id = await insertAndGetId(
        db.insertInto('pinned_folders').values({
          connection_id: connectionId,
          user_id: userId,
          path,
        }),
        type
      );
      return { id };
    } catch (error) {
      // Already pinned: a stray double-click is a no-op, not an error.
      if (isUniqueViolation(error, type)) {
        const existing = await db
          .selectFrom('pinned_folders')
          .select('id')
          .where('connection_id', '=', connectionId)
          .where('user_id', '=', userId)
          .where('path', '=', path)
          .executeTakeFirst();
        if (existing) return { id: existing.id };
      }
      throw error;
    }
  });
}

export async function unpinFolder(id: number): Promise<ActionResult<true>> {
  return attempt(
    'Unpin Folder Error',
    'Could not unpin that folder.',
    async () => {
      const userId = await currentUserId();
      const { db } = await getDb();
      // Scoped to the owner so a guessed id cannot remove somebody else's pin.
      await db
        .deleteFrom('pinned_folders')
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .execute();
      return true as const;
    }
  );
}

/**
 * Deletes the pin for `path` and any pin nested under it, for when the folder
 * itself is gone. Returns the removed paths so the caller can drop them from
 * local state without waiting for a refetch.
 *
 * Filters in JS rather than a SQL LIKE: pin counts per connection are small
 * (`getPinnedFolders` already full-scans), and an S3 key can contain a literal
 * `%` or `_`, which LIKE would silently treat as a wildcard.
 */
export async function unpinFoldersUnder(
  connectionId: number,
  path: string
): Promise<string[]> {
  try {
    const userId = await currentUserId();
    const { db } = await getDb();
    // Only the acting user's own pins. Another user's bookmark on the same
    // deleted folder is left alone — they did not do the deleting, and the
    // existing "missing" state is how that surfaces to them.
    const rows = await db
      .selectFrom('pinned_folders')
      .select(['id', 'path'])
      .where('connection_id', '=', connectionId)
      .where('user_id', '=', userId)
      .execute();

    const prefix = path.endsWith('/') ? path : `${path}/`;
    const doomed = rows.filter(
      (row) => row.path === path || row.path.startsWith(prefix)
    );
    if (doomed.length === 0) return [];

    await db
      .deleteFrom('pinned_folders')
      .where(
        'id',
        'in',
        doomed.map((row) => row.id)
      )
      .execute();
    return doomed.map((row) => row.path);
  } catch (error) {
    // The folder is already deleted either way; a stale pin renders as
    // "missing", which is the state this whole feature is designed around.
    console.error('Unpin Folders Under Error:', error);
    return [];
  }
}

/**
 * Checks which of `paths` still exist in the bucket.
 *
 * Both storage backends call it: where a bookmark lives is a client concern,
 * whether the folder exists is always a storage one.
 *
 * A false result only greys the row out. It reads the same as a network blip or
 * a scoped-down credential, so deleting on it would drop a bookmark with no undo.
 */
export async function validateFolderPaths(
  config: ConnectionConfig,
  paths: string[]
): Promise<boolean[]> {
  if (paths.length === 0) return [];

  try {
    const op = getOperator(config);

    return await Promise.all(
      // A failed exists() reads as "missing" instead of aborting the batch. One
      // bad pin must not blank every other pin in the sidebar.
      paths.map((p) => op.exists(p).catch(() => false))
    );
  } catch (error) {
    console.error('Validate Folder Paths Error:', error);
    return paths.map(() => false);
  }
}

/** Pins for one connection, existence validated inline. SQLite mode only. */
export async function getPinnedFolders(
  config: ConnectionConfig
): Promise<ValidatedPinnedFolder[]> {
  if (!config.id) return [];

  try {
    const userId = await currentUserId();
    const { db } = await getDb();
    const rows = await db
      .selectFrom('pinned_folders')
      .selectAll()
      .where('connection_id', '=', config.id)
      .where('user_id', '=', userId)
      .orderBy('created_at', 'asc')
      .execute();

    if (rows.length === 0) return [];

    const flags = await validateFolderPaths(
      config,
      rows.map((row) => row.path)
    );

    // Postgres and MySQL hand back a Date where SQLite hands back a string,
    // and this crosses to a client component, so normalise it here.
    return rows.map((row, i) => ({
      ...row,
      created_at: String(row.created_at),
      exists: flags[i],
    }));
  } catch (error) {
    console.error('Get Pinned Folders Error:', error);
    return []; // mirrors getConnections: read paths degrade, never throw
  }
}
