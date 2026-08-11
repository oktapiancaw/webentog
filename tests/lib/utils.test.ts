// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyVersionListFailure,
  cursorAfterKey,
  formatStorage,
} from '../../lib/utils.ts';

test('file keys are used verbatim', () => {
  assert.equal(cursorAfterKey('logs/a.txt', false), 'logs/a.txt');
  assert.equal(cursorAfterKey('', false), '');
});

test('folder cursor sorts past every key in its subtree', () => {
  const folder = 'logs/2026/';
  const cursor = cursorAfterKey(folder, true);

  assert.equal(cursor, 'logs/20260');

  // The whole point: children must fall BEFORE the cursor, so S3 does not
  // re-list them and collapse them back into the same CommonPrefix.
  for (const child of [
    'logs/2026/a.txt',
    'logs/2026/zzz.txt',
    'logs/2026/nested/deep.json',
    'logs/2026/￿',
  ]) {
    assert.ok(child < cursor, `${child} should sort before ${cursor}`);
    assert.ok(child > folder, `${child} should sort after ${folder} (the bug)`);
  }
});

test('folder cursor does not skip the next sibling', () => {
  const cursor = cursorAfterKey('logs/2026/', true);
  // A sibling that sorts after the folder must still be listed.
  for (const sibling of ['logs/2027/', 'logs/a.txt', 'logs/z/']) {
    assert.ok(sibling > cursor, `${sibling} should sort after ${cursor}`);
  }
});

test('empty folder key is left alone rather than producing garbage', () => {
  assert.equal(cursorAfterKey('', true), '');
});

// The real Ceph RGW failure this was written for: 403 on GET ?versions when
// the credentials lack ListBucketVersions.
const CEPH_403 =
  'Error: PermissionDenied (permanent) at list, context: { uri: http://host:8000/datalake?versions&prefix=data/x/&delimiter=/, ' +
  'response: Parts { status: 403, ... server: "Ceph Object Gateway (tentacle)" } } => S3Error { code: "AccessDenied" }';

test('permission failures degrade instead of throwing', () => {
  assert.equal(classifyVersionListFailure(CEPH_403)?.reason, 'denied');
  assert.equal(
    classifyVersionListFailure(new Error('AccessDenied'))?.reason,
    'denied'
  );
});

test('gateways without versioning support are recognised', () => {
  assert.equal(
    classifyVersionListFailure(new Error('NotImplemented'))?.reason,
    'unsupported'
  );
  assert.equal(
    classifyVersionListFailure('got 501 from gateway')?.reason,
    'unsupported'
  );
});

test('unrelated failures are not swallowed', () => {
  // These must return null so the caller rethrows — silently showing "no
  // versions" for a network or 500 error would hide a real problem.
  assert.equal(classifyVersionListFailure(new Error('ECONNREFUSED')), null);
  assert.equal(classifyVersionListFailure(new Error('500 Internal')), null);
  assert.equal(classifyVersionListFailure(new Error('NoSuchBucket')), null);
});

test('sizes are formatted from bytes, not kilobytes', () => {
  // The reported bug: a 9.5 MB object rendered as "9.5BB" because the input was
  // treated as KB (x1024) and Intl compact collided "billion" with "byte".
  assert.equal(formatStorage(9961472), '9.5 MB');

  assert.equal(formatStorage(0), '0 B');
  assert.equal(formatStorage(512), '512 B');
  assert.equal(formatStorage(1024), '1.0 KB');
  assert.equal(formatStorage(1536), '1.5 KB');
  assert.equal(formatStorage(1024 ** 3), '1.0 GB');
  assert.equal(formatStorage(1024 ** 4), '1.0 TB');
});

test('size formatting never emits a doubled unit letter', () => {
  for (const bytes of [1, 1e3, 1e6, 1e9, 1e12, 1e15]) {
    const out = formatStorage(bytes);
    assert.ok(!/BB$/.test(out), `${bytes} formatted as ${out}`);
  }
});

test('bad size input degrades to a placeholder', () => {
  assert.equal(formatStorage(NaN), '--');
  assert.equal(formatStorage(-1), '--');
});
