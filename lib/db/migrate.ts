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

import { Kysely, sql } from 'kysely';
import type { DbType } from './config';
import { ensureMysqlPinIndex, UNIQUE_PIN_INDEX } from './schema';
import type { Database } from './types';

/**
 * Brings a database created before ownership existed up to the current shape.
 *
 * `CREATE TABLE IF NOT EXISTS` only helps a fresh install; an existing one
 * keeps its old columns forever. There is no migration framework here, so this
 * is the whole mechanism — it must stay idempotent, and it uses the presence
 * of a column as its own "has this run" marker rather than a version table.
 */
export async function migrateForOwnership(
  db: Kysely<Database>,
  type: DbType,
  adminId: number
): Promise<void> {
  const columns = await tableColumns(db);

  // Added after users already existed, so an upgraded install needs it too.
  if (columns.users && !columns.users.has('full_name')) {
    await sql`ALTER TABLE users ADD COLUMN full_name varchar(255)`.execute(db);
  }

  if (!columns.connections?.has('owner_id')) {
    await sql`ALTER TABLE connections ADD COLUMN owner_id integer`.execute(db);
  }
  // Backfilled outside the ADD COLUMN branch so a half-finished upgrade (added
  // the column, died before filling it) still completes on the next boot.
  await db
    .updateTable('connections')
    .set({ owner_id: adminId })
    .where('owner_id', 'is', null)
    .execute();

  if (!columns.pinned_folders?.has('user_id')) {
    await widenPinUniqueness(db, type, adminId);
  }
  await db
    .updateTable('pinned_folders')
    .set({ user_id: adminId })
    .where('user_id', 'is', null)
    .execute();
}

/**
 * Adds `pinned_folders.user_id` and moves the unique key from
 * (connection_id, path) to (connection_id, user_id, path).
 *
 * Dropping the old key is the point, not an incidental: while it stands, two
 * users cannot pin the same folder on a connection they both have access to,
 * so an upgraded install would quietly behave differently from a fresh one.
 * Each engine drops a constraint its own way, and SQLite cannot drop one at
 * all — hence the rebuild there.
 */
async function widenPinUniqueness(
  db: Kysely<Database>,
  type: DbType,
  adminId: number
): Promise<void> {
  if (type === 'sqlite') {
    // SQLite has no DROP CONSTRAINT. The documented way out is to rebuild the
    // table and copy the rows across.
    await sql`
      CREATE TABLE pinned_folders_new (
        id integer primary key autoincrement,
        connection_id integer not null,
        user_id integer,
        path varchar(1024) not null,
        created_at timestamp not null default CURRENT_TIMESTAMP,
        constraint ${sql.raw(UNIQUE_PIN_INDEX)}
          unique (connection_id, user_id, path)
      )
    `.execute(db);
    await sql`
      INSERT INTO pinned_folders_new (id, connection_id, user_id, path, created_at)
      SELECT id, connection_id, ${adminId}, path, created_at FROM pinned_folders
    `.execute(db);
    await sql`DROP TABLE pinned_folders`.execute(db);
    await sql`ALTER TABLE pinned_folders_new RENAME TO pinned_folders`.execute(
      db
    );
    return;
  }

  await sql`ALTER TABLE pinned_folders ADD COLUMN user_id integer`.execute(db);
  await sql`UPDATE pinned_folders SET user_id = ${adminId}`.execute(db);

  if (type === 'postgres') {
    await sql`
      ALTER TABLE pinned_folders
        DROP CONSTRAINT IF EXISTS ${sql.raw(UNIQUE_PIN_INDEX)}
    `.execute(db);
    await sql`
      ALTER TABLE pinned_folders
        ADD CONSTRAINT ${sql.raw(UNIQUE_PIN_INDEX)}
        UNIQUE (connection_id, user_id, path)
    `.execute(db);
    return;
  }

  // MySQL: DROP INDEX has no IF EXISTS, so check before dropping. Recreating
  // it goes back through ensureMysqlPinIndex to keep the 700-char prefix rule
  // in exactly one place.
  const found = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'pinned_folders'
       AND index_name = ${UNIQUE_PIN_INDEX}
  `.execute(db);
  if (Number(found.rows[0]?.n ?? 0) > 0) {
    await sql`
      ALTER TABLE pinned_folders DROP INDEX ${sql.raw(UNIQUE_PIN_INDEX)}
    `.execute(db);
  }
  await ensureMysqlPinIndex(db);
}

/** Column names per table, via Kysely's cross-dialect introspection. */
async function tableColumns(
  db: Kysely<Database>
): Promise<Record<string, Set<string>>> {
  const tables = await db.introspection.getTables();
  return Object.fromEntries(
    tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))])
  );
}
