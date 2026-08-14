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

import type { DbType } from './config';

/**
 * Whether an error is a unique-constraint conflict.
 *
 * Kysely passes driver errors through untouched, so each dialect reports this
 * its own way. The SQLite-only version sniffed for the substring "UNIQUE" in
 * the message, which is both engine-specific and would false-positive on any
 * other error whose text happens to mention it.
 *
 * Kept free of driver imports so it stays testable on its own.
 */
export function isUniqueViolation(error: unknown, type: DbType): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, errno } = error as { code?: string; errno?: number };
  switch (type) {
    case 'sqlite':
      return (
        code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
      );
    case 'postgres':
      return code === '23505';
    case 'mysql':
      return code === 'ER_DUP_ENTRY' || errno === 1062;
  }
}

/**
 * The value to bind for a boolean column on this engine.
 *
 * better-sqlite3 refuses a JS boolean outright ("SQLite3 can only bind
 * numbers, strings, bigints, buffers, and null"), while Postgres refuses the
 * integer that would satisfy it. mysql2 takes either.
 */
export function pinnedValue(type: DbType, value: boolean): boolean | number {
  return type === 'sqlite' ? (value ? 1 : 0) : value;
}
