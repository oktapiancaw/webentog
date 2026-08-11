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

import { Operator } from 'opendal';
import { getDb } from '@/lib/db';
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

export async function pinFolder(
  connectionId: number,
  path: string
): Promise<{ id: number }> {
  try {
    const result = getDb()
      .prepare('INSERT INTO pinned_folders (connection_id, path) VALUES (?, ?)')
      .run(connectionId, path);
    return { id: Number(result.lastInsertRowid) };
  } catch (error) {
    // Already pinned: a stray double-click is a no-op, not an error.
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      const existing = getDb()
        .prepare(
          'SELECT id FROM pinned_folders WHERE connection_id = ? AND path = ?'
        )
        .get(connectionId, path) as { id: number } | undefined;
      if (existing) return { id: existing.id };
    }
    console.error('Pin Folder Error:', error);
    throw new Error('Failed to pin folder.');
  }
}

export async function unpinFolder(id: number): Promise<{ success: true }> {
  try {
    getDb().prepare('DELETE FROM pinned_folders WHERE id = ?').run(id);
    return { success: true };
  } catch (error) {
    console.error('Unpin Folder Error:', error);
    throw new Error('Failed to unpin folder.');
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
    const op = new Operator('s3', {
      endpoint: config.endpoint,
      access_key_id: config.accessKey,
      secret_access_key: config.secretKey,
      bucket: config.bucket,
      region: config.region,
      allow_http: 'true',
    });

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
    const rows = getDb()
      .prepare(
        'SELECT * FROM pinned_folders WHERE connection_id = ? ORDER BY created_at ASC'
      )
      .all(config.id) as PinnedFolder[];

    if (rows.length === 0) return [];

    const flags = await validateFolderPaths(
      config,
      rows.map((row) => row.path)
    );

    return rows.map((row, i) => ({ ...row, exists: flags[i] }));
  } catch (error) {
    console.error('Get Pinned Folders Error:', error);
    return []; // mirrors getConnections: read paths degrade, never throw
  }
}
