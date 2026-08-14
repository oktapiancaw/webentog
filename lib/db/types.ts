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

import type { ColumnType, Generated } from 'kysely';

/**
 * `created_at` is never written or updated by the app — the column default
 * fills it — so it is selectable but not insertable or updatable. Postgres and
 * MySQL hand back a Date where SQLite hands back a string, hence the union on
 * the select side.
 */
type CreatedAt = ColumnType<Date | string, never, never>;

export type UserRole = 'admin' | 'user';

export interface UsersTable {
  id: Generated<number>;
  username: string;
  /** Display name. Optional: the username alone has always been enough. */
  full_name: string | null;
  password_hash: string;
  role: UserRole;
  created_at: CreatedAt;
}

/**
 * Access to a connection somebody else owns. All-or-nothing: a grant carries
 * the same rights the owner has, there are no permission tiers.
 */
export interface ConnectionGrantsTable {
  id: Generated<number>;
  connection_id: number;
  user_id: number;
  granted_at: CreatedAt;
}

export interface ConnectionsTable {
  id: Generated<number>;
  name: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  /**
   * Nullable only because an upgraded install adds the column to rows that
   * predate it; the backfill fills them and the app always supplies one.
   */
  owner_id: number | null;
  created_at: CreatedAt;
}

export interface PinnedFoldersTable {
  id: Generated<number>;
  connection_id: number;
  /** Pins are never shared, even when the connection they sit on is. */
  user_id: number | null;
  path: string;
  created_at: CreatedAt;
}

/**
 * One viewer's ordering and pin state for one connection.
 *
 * Deliberately not columns on `connections`: a connection is visible to its
 * owner and to everyone it has been granted to, so a pin or a position stored
 * on the shared row would move the connection in every one of those sidebars
 * at once. Keyed by (user_id, connection_id) instead, so each viewer arranges
 * their own list.
 *
 * A row only appears once a user actually reorders or pins something. Absence
 * means "default order, unpinned", so nothing needs backfilling.
 */
export interface ConnectionPrefsTable {
  id: Generated<number>;
  user_id: number;
  connection_id: number;
  /**
   * Boolean on Postgres, 0/1 on SQLite and MySQL.
   *
   * better-sqlite3 binds only numbers, strings, bigints, buffers and null, so
   * a JS boolean throws there; Postgres in turn rejects an integer for a
   * boolean column. There is no single value that works on all three, so the
   * type admits both and `pinnedValue()` picks per engine. Readers go through
   * `Boolean()`.
   */
  pinned: boolean | number;
  sort_order: number;
}

export interface Database {
  users: UsersTable;
  connections: ConnectionsTable;
  connection_grants: ConnectionGrantsTable;
  pinned_folders: PinnedFoldersTable;
  connection_prefs: ConnectionPrefsTable;
}
