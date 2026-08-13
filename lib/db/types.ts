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

export interface Database {
  users: UsersTable;
  connections: ConnectionsTable;
  connection_grants: ConnectionGrantsTable;
  pinned_folders: PinnedFoldersTable;
}
