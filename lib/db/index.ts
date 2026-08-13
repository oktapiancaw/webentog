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

import {
  Kysely,
  MysqlDialect,
  PostgresDialect,
  SqliteDialect,
  type Dialect,
  type InsertQueryBuilder,
  type InsertResult,
} from 'kysely';
import SqliteDatabase from 'better-sqlite3';
import { createPool } from 'mysql2';
import { Pool } from 'pg';
import path from 'path';
import { readDbConfig, type DbConfig, type DbType } from './config';
import { isUniqueViolation } from './dialect';
import { migrateForOwnership } from './migrate';
import { ensureSchema } from './schema';
import { seedAdmin } from './seed';
import type { Database } from './types';

export type { DbType } from './config';
export { isUniqueViolation };
export type { Database } from './types';

export interface DbHandle {
  db: Kysely<Database>;
  /** Carried alongside the connection because insert-id retrieval and
   *  unique-violation detection both differ per dialect. */
  type: DbType;
}

let handle: Promise<DbHandle> | null = null;

/**
 * Importing a driver is free; only these constructors dial anything, and they
 * run from getDb() rather than at module load.
 */
function buildDialect(config: DbConfig): Dialect {
  switch (config.type) {
    case 'postgres':
      return new PostgresDialect({ pool: new Pool(config.network) });
    case 'mysql':
      return new MysqlDialect({ pool: createPool(config.network!) });
    default:
      return new SqliteDialect({
        database: new SqliteDatabase(
          path.isAbsolute(config.sqlitePath)
            ? config.sqlitePath
            : path.join(process.cwd(), config.sqlitePath)
        ),
      });
  }
}

/**
 * The database, opened on first use.
 *
 * Lazy on purpose, and the laziness is load-bearing: with
 * PERSISTENT_CONNECTION=false nothing may touch the database at all. Opening
 * at import time would create ./data/connections.db, or crash the app on
 * SQLITE_CANTOPEN when ./data is not mounted — and on Postgres/MySQL it would
 * dial a server that a sessionStorage-only deployment has no reason to run.
 *
 * The guard below states that rule instead of leaving it to the call graph:
 * every current caller is already gated on persistent mode, and a future one
 * that is not should fail loudly here rather than quietly writing to disk.
 */
export function getDb(): Promise<DbHandle> {
  if (process.env.PERSISTENT_CONNECTION === 'false') {
    return Promise.reject(
      new Error(
        'The database is disabled while PERSISTENT_CONNECTION=false; connections and pins live in the browser session instead.'
      )
    );
  }

  if (!handle) {
    handle = (async () => {
      const config = readDbConfig();
      const db = new Kysely<Database>({ dialect: buildDialect(config) });
      await ensureSchema(db, config.type);
      // Ownership needs somebody to belong to, so the admin is seeded before
      // rows that predate the users table are backfilled onto it.
      const adminId = await seedAdmin(db, config.type);
      await migrateForOwnership(db, config.type, adminId);
      return { db, type: config.type };
    })().catch((error) => {
      // Never cache a failed open: a database that was briefly unreachable
      // would otherwise stay "down" for the lifetime of the process.
      handle = null;
      throw error;
    });
  }
  return handle;
}

/**
 * Runs an insert and returns the new row's id.
 *
 * MySQL reports it as `insertId` on the result; Postgres and SQLite (
 * better-sqlite3 bundles SQLite 3.35+) both support RETURNING, which is the
 * only way to get it out of Kysely's Postgres dialect.
 */
export async function insertAndGetId<TB extends keyof Database>(
  qb: InsertQueryBuilder<Database, TB, InsertResult>,
  type: DbType
): Promise<number> {
  if (type === 'mysql') {
    const result = await qb.executeTakeFirstOrThrow();
    return Number(result.insertId);
  }
  const row = await qb.returning('id' as never).executeTakeFirstOrThrow();
  return Number((row as unknown as { id: number | bigint }).id);
}
