// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDbConfig, DEFAULT_SQLITE_PATH } from '../../lib/db/config.ts';
import { isUniqueViolation } from '../../lib/db/dialect.ts';

test('an empty environment is the old SQLite behaviour', () => {
  // The backward-compat guarantee: upgrading without touching .env must not
  // move the database or change engines.
  assert.deepEqual(readDbConfig({}), {
    type: 'sqlite',
    sqlitePath: DEFAULT_SQLITE_PATH,
  });
});

test('DATABASE_PATH moves the SQLite file without changing engine', () => {
  const c = readDbConfig({ DATABASE_PATH: '/srv/webentog.db' });
  assert.equal(c.type, 'sqlite');
  assert.equal(c.sqlitePath, '/srv/webentog.db');
  assert.equal(c.network, undefined);
});

test('an unknown DATABASE_TYPE is rejected, not silently defaulted', () => {
  // Defaulting a typo to sqlite would look like "my Postgres data vanished".
  assert.throws(
    () => readDbConfig({ DATABASE_TYPE: 'postgress' }),
    /must be one of/
  );
});

test('DATABASE_TYPE is case and whitespace tolerant', () => {
  const env = {
    DATABASE_TYPE: ' Postgres ',
    DATABASE_HOST: 'db',
    DATABASE_USERNAME: 'u',
    DATABASE_PASSWORD: 'p',
    DATABASE_NAME: 'n',
  };
  assert.equal(readDbConfig(env).type, 'postgres');
});

test('network engines name every missing variable at once', () => {
  assert.throws(
    () => readDbConfig({ DATABASE_TYPE: 'postgres' }),
    /DATABASE_HOST, DATABASE_USERNAME, DATABASE_PASSWORD, DATABASE_NAME/
  );
  assert.throws(
    () =>
      readDbConfig({
        DATABASE_TYPE: 'mysql',
        DATABASE_HOST: 'db',
        DATABASE_NAME: 'n',
      }),
    /DATABASE_USERNAME, DATABASE_PASSWORD/
  );
});

test('the default port follows the engine', () => {
  const base = {
    DATABASE_HOST: 'db',
    DATABASE_USERNAME: 'u',
    DATABASE_PASSWORD: 'p',
    DATABASE_NAME: 'n',
  };
  assert.equal(
    readDbConfig({ ...base, DATABASE_TYPE: 'postgres' }).network?.port,
    5432
  );
  assert.equal(
    readDbConfig({ ...base, DATABASE_TYPE: 'mysql' }).network?.port,
    3306
  );
  assert.equal(
    readDbConfig({ ...base, DATABASE_TYPE: 'mysql', DATABASE_PORT: '3307' })
      .network?.port,
    3307
  );
});

test('a nonsense port is rejected rather than becoming NaN', () => {
  const env = {
    DATABASE_TYPE: 'postgres',
    DATABASE_HOST: 'db',
    DATABASE_USERNAME: 'u',
    DATABASE_PASSWORD: 'p',
    DATABASE_NAME: 'n',
    DATABASE_PORT: 'five-thousand',
  };
  assert.throws(() => readDbConfig(env), /must be a port number/);
});

test('an empty password is still a password', () => {
  // A trust-boundary detail: `''` is falsy, so a naive check would report it
  // missing and refuse to start against a passwordless dev database.
  const env = {
    DATABASE_TYPE: 'postgres',
    DATABASE_HOST: 'db',
    DATABASE_USERNAME: 'u',
    DATABASE_PASSWORD: '',
    DATABASE_NAME: 'n',
  };
  assert.throws(() => readDbConfig(env), /DATABASE_PASSWORD/);
});

test('unique violations are recognised per dialect', () => {
  // Each driver reports the same conflict differently; getting this wrong
  // turns a re-pin from a no-op into a thrown error.
  assert.equal(
    isUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' }, 'sqlite'),
    true
  );
  assert.equal(isUniqueViolation({ code: '23505' }, 'postgres'), true);
  assert.equal(isUniqueViolation({ code: 'ER_DUP_ENTRY' }, 'mysql'), true);
  assert.equal(isUniqueViolation({ errno: 1062 }, 'mysql'), true);
});

test('unique-violation detection does not fire across dialects', () => {
  // The old code sniffed for "UNIQUE" in the message, which would match a
  // Postgres error too. Codes must not be read against the wrong engine.
  assert.equal(isUniqueViolation({ code: '23505' }, 'sqlite'), false);
  assert.equal(
    isUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' }, 'postgres'),
    false
  );
  assert.equal(isUniqueViolation({ code: '23503' }, 'postgres'), false);
  assert.equal(
    isUniqueViolation(new Error('UNIQUE constraint failed'), 'sqlite'),
    false
  );
  assert.equal(isUniqueViolation(null, 'sqlite'), false);
  assert.equal(isUniqueViolation(undefined, 'mysql'), false);
});
