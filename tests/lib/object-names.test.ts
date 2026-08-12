// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isPermissionDenied,
  replaceLastSegment,
  validateObjectName,
} from '../../lib/utils.ts';

test('ordinary names pass', () => {
  for (const name of [
    'report.pdf',
    'my folder',
    'a-b_c.2026',
    'ünïcödé',
    '.env',
  ]) {
    assert.equal(validateObjectName(name), null, name);
  }
});

test('a name cannot escape its folder', () => {
  // The one that matters: without it, rename silently becomes move.
  assert.match(validateObjectName('../../etc/passwd') ?? '', /"\/"/);
  assert.match(validateObjectName('sub/dir') ?? '', /"\/"/);
  assert.match(validateObjectName('trailing/') ?? '', /"\/"/);
});

test('empty, dot and dot-dot are rejected', () => {
  assert.ok(validateObjectName(''));
  assert.ok(validateObjectName('   '));
  assert.ok(validateObjectName('.'));
  assert.ok(validateObjectName('..'));
});

test('control characters are rejected', () => {
  assert.ok(validateObjectName('bad\u0000name'));
  assert.ok(validateObjectName('bad\nname'));
  assert.ok(validateObjectName('bad\u007fname'));
});

test('the length cap counts bytes, not characters', () => {
  assert.equal(validateObjectName('a'.repeat(255)), null);
  assert.ok(validateObjectName('a'.repeat(256)));
  // 128 three-byte characters is 384 bytes, well past the cap.
  assert.ok(validateObjectName('あ'.repeat(128)));
});

test('replaceLastSegment keeps the parent prefix', () => {
  assert.equal(replaceLastSegment('a/b/old.txt', 'new.txt'), 'a/b/new.txt');
  assert.equal(replaceLastSegment('old.txt', 'new.txt'), 'new.txt');
});

test('replaceLastSegment keeps a folder a folder', () => {
  assert.equal(replaceLastSegment('a/b/old/', 'new'), 'a/b/new/');
  assert.equal(replaceLastSegment('old/', 'new'), 'new/');
});

test('a denied delete is recognised from the flattened OpenDAL message', () => {
  // The shape the Node binding actually produces.
  assert.ok(
    isPermissionDenied(
      new Error(
        'PermissionDenied (permanent) at delete, context: { url: http://host/bucket/key, service: s3 }'
      )
    )
  );
  assert.ok(isPermissionDenied(new Error('<Code>AccessDenied</Code>')));
  assert.ok(isPermissionDenied(new Error('403 Forbidden')));
});

test('an ordinary failure is not mistaken for a permission problem', () => {
  assert.equal(
    isPermissionDenied(new Error('Unexpected (temporary) at list')),
    false
  );
  assert.equal(isPermissionDenied(new Error('NotFound at stat')), false);
  assert.equal(isPermissionDenied(undefined), false);
});
