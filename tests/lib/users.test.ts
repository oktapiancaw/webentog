// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateFullName,
  validatePassword,
  validateUsername,
} from '../../lib/users.ts';

test('ordinary usernames pass', () => {
  for (const n of ['admin', 'okta.pian', 'a_b-c', 'user@example.com']) {
    assert.equal(validateUsername(n), null, n);
  }
});

test('usernames that would break the UI or the column are rejected', () => {
  assert.ok(validateUsername(''));
  assert.ok(validateUsername('  '));
  assert.ok(validateUsername('ab')); // too short
  assert.ok(validateUsername('a'.repeat(65))); // past the cap
  assert.ok(validateUsername('has space'));
  assert.ok(validateUsername('drop;table'));
});

test('a password must be long enough to be worth hashing', () => {
  assert.equal(validatePassword('correct-horse'), null);
  assert.ok(validatePassword(''));
  assert.ok(validatePassword('short7'));
});

test('a password past bcrypt 72-byte limit is refused, not truncated', () => {
  // bcrypt ignores bytes past 72. Silently accepting a 100-character password
  // would make it interchangeable with its own first 72 bytes.
  assert.equal(validatePassword('a'.repeat(72)), null);
  assert.ok(validatePassword('a'.repeat(73)));
  // Multi-byte characters hit the limit sooner; the check counts bytes.
  assert.ok(validatePassword('é'.repeat(37)));
});

test('a full name is optional', () => {
  // Blank is valid and means "not set"; the action stores null for it.
  assert.equal(validateFullName(''), null);
  assert.equal(validateFullName('   '), null);
  assert.equal(validateFullName('Oktapian Candra'), null);
  assert.equal(validateFullName("Renée O'Brien-Smith"), null);
});

test('a full name is bounded and free of control characters', () => {
  assert.ok(validateFullName('a'.repeat(121)));
  assert.ok(validateFullName('bad\u0000name'));
  assert.ok(validateFullName('two\nlines'));
});
