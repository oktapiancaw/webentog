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

export type DbType = 'sqlite' | 'postgres' | 'mysql';

export const DB_TYPES: DbType[] = ['sqlite', 'postgres', 'mysql'];

/** Same path the app hardcoded before `DATABASE_PATH` existed. */
export const DEFAULT_SQLITE_PATH = './data/connections.db';

export interface NetworkDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface DbConfig {
  type: DbType;
  sqlitePath: string;
  /** Set for postgres and mysql; absent for sqlite. */
  network?: NetworkDbConfig;
}

const DEFAULT_PORTS: Record<Exclude<DbType, 'sqlite'>, number> = {
  postgres: 5432,
  mysql: 3306,
};

/**
 * Reads the `DATABASE_*` environment into a config.
 *
 * Every variable is optional: unset means sqlite at the old hardcoded path, so
 * upgrading without touching `.env` changes nothing. Anything else is
 * validated here rather than at the first query, since a typo'd
 * `DATABASE_TYPE` should not look like "the database is down".
 *
 * Exported as a pure function of `env` so it can be tested without mutating
 * the process environment.
 */
export function readDbConfig(
  env: Record<string, string | undefined> = process.env
): DbConfig {
  const raw = env.DATABASE_TYPE?.trim().toLowerCase();
  if (raw && !DB_TYPES.includes(raw as DbType)) {
    throw new Error(
      `DATABASE_TYPE must be one of ${DB_TYPES.join(', ')} (got "${env.DATABASE_TYPE}").`
    );
  }
  const type = (raw as DbType) || 'sqlite';
  const sqlitePath = env.DATABASE_PATH?.trim() || DEFAULT_SQLITE_PATH;

  if (type === 'sqlite') return { type, sqlitePath };

  const host = env.DATABASE_HOST?.trim();
  const user = env.DATABASE_USERNAME?.trim();
  const password = env.DATABASE_PASSWORD;
  const database = env.DATABASE_NAME?.trim();

  const missing = [
    ['DATABASE_HOST', host],
    ['DATABASE_USERNAME', user],
    ['DATABASE_PASSWORD', password],
    ['DATABASE_NAME', database],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(`DATABASE_TYPE=${type} also needs ${missing.join(', ')}.`);
  }

  const portRaw = env.DATABASE_PORT?.trim();
  const port = portRaw ? Number(portRaw) : DEFAULT_PORTS[type];
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`DATABASE_PORT must be a port number (got "${portRaw}").`);
  }

  return {
    type,
    sqlitePath,
    network: {
      host: host!,
      port,
      user: user!,
      password: password!,
      database: database!,
    },
  };
}
