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

import { Kysely, sql, type ColumnDefinitionBuilder } from 'kysely';
import type { DbType } from './config';
import type { Database } from './types';

/**
 * Creates the tables if they are missing. `IF NOT EXISTS` is the whole
 * migration story, matching what the SQLite-only version did — there is no
 * versioned migration framework here.
 *
 * Runs on every process start, so it must stay idempotent.
 */
export async function ensureSchema(
  db: Kysely<Database>,
  type: DbType
): Promise<void> {
  // Postgres has no AUTO_INCREMENT keyword; `serial` carries the sequence
  // itself, so the column type and the modifier both differ by dialect.
  const idType = type === 'postgres' ? 'serial' : 'integer';
  const idColumn = (c: ColumnDefinitionBuilder) =>
    type === 'postgres' ? c.primaryKey() : c.primaryKey().autoIncrement();

  await db.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id', idType, idColumn)
    // varchar rather than text: MySQL cannot put a unique index on unbounded
    // text, the same limit that shapes pinned_folders.path below.
    .addColumn('username', 'varchar(255)', (c) => c.notNull().unique())
    .addColumn('full_name', 'varchar(255)')
    .addColumn('password_hash', 'text', (c) => c.notNull())
    .addColumn('role', 'varchar(16)', (c) => c.notNull())
    .addColumn('created_at', 'timestamp', (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  await db.schema
    .createTable('connection_grants')
    .ifNotExists()
    .addColumn('id', idType, idColumn)
    .addColumn('connection_id', 'integer', (c) => c.notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull())
    .addColumn('granted_at', 'timestamp', (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    // Re-granting is a no-op rather than a duplicate row, the same shape the
    // pin table uses. Both columns are integers, so no prefix trouble here.
    .addUniqueConstraint('connection_grants_connection_user_unique', [
      'connection_id',
      'user_id',
    ])
    .execute();

  await db.schema
    .createTable('connections')
    .ifNotExists()
    .addColumn('id', idType, idColumn)
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('endpoint', 'text', (c) => c.notNull())
    .addColumn('accessKey', 'text', (c) => c.notNull())
    .addColumn('secretKey', 'text', (c) => c.notNull())
    .addColumn('bucket', 'text', (c) => c.notNull())
    .addColumn('region', 'text', (c) => c.notNull())
    .addColumn('owner_id', 'integer')
    .addColumn('created_at', 'timestamp', (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Folder bookmarks, scoped to a connection. UNIQUE because double-pinning
  // the same folder has no meaning — unlike `connections`, where "same bucket
  // under a different name" is legitimate and so carries no such constraint.
  //
  // `path` is varchar(1024) rather than text because MySQL refuses a unique
  // index over an unbounded text column (error 1170). 1024 is S3's own key
  // limit in bytes, so nothing valid gets truncated.
  let table = db.schema
    .createTable('pinned_folders')
    .ifNotExists()
    .addColumn('id', idType, idColumn)
    .addColumn('connection_id', 'integer', (c) => c.notNull())
    .addColumn('user_id', 'integer')
    .addColumn('path', 'varchar(1024)', (c) => c.notNull())
    .addColumn('created_at', 'timestamp', (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    );

  // MySQL indexes cost bytes, not characters: varchar(1024) under utf8mb4 is
  // 4096 of them, well past InnoDB's 3072-byte key limit (error 1071). A
  // prefix index is the way out, and Kysely cannot express a prefix length in
  // addUniqueConstraint, so MySQL gets the index as a separate statement.
  if (type !== 'mysql') {
    table = table.addUniqueConstraint(UNIQUE_PIN_INDEX, [
      'connection_id',
      'user_id',
      'path',
    ]);
  }
  await table.execute();

  if (type === 'mysql') await ensureMysqlPinIndex(db);
}

export const UNIQUE_PIN_INDEX = 'pinned_folders_connection_path_unique';

/**
 * Adds the unique index MySQL could not take inline.
 *
 * 700 characters is 2800 bytes under utf8mb4, leaving room for the two 4-byte
 * integers inside the 3072-byte budget. Two folders whose keys match for
 * their first 700 characters would collide here and the second pin would
 * resolve to the first — no data is lost or truncated, and no realistic S3 key
 * comes near that, but it is a real difference from the other two engines.
 *
 * MySQL has no CREATE UNIQUE INDEX IF NOT EXISTS, and this runs on every
 * start, so existence is checked first.
 */
export async function ensureMysqlPinIndex(db: Kysely<Database>): Promise<void> {
  const existing = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'pinned_folders'
       AND index_name = ${UNIQUE_PIN_INDEX}
  `.execute(db);

  if (Number(existing.rows[0]?.n ?? 0) > 0) return;

  await sql`
    ALTER TABLE pinned_folders
      ADD UNIQUE INDEX ${sql.raw(UNIQUE_PIN_INDEX)}
        (connection_id, user_id, path(700))
  `.execute(db);
}
