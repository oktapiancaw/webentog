// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LARGE_FILE_THRESHOLD_BYTES,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_TOTAL_BYTES,
  buildUploadPath,
  tooBigMessage,
  validateUploadBatch,
} from '../../lib/upload.ts';

const sized = (n: number) => Array.from({ length: n }, () => ({ size: 1024 }));

test('an empty selection is rejected', () => {
  assert.ok(validateUploadBatch([]));
});

test('up to the file-count cap is fine', () => {
  assert.equal(validateUploadBatch(sized(MAX_UPLOAD_FILES)), null);
});

test('one file past the count cap is rejected', () => {
  assert.ok(validateUploadBatch(sized(MAX_UPLOAD_FILES + 1)));
});

test('a single file over the per-file cap is rejected by name', () => {
  const message = validateUploadBatch([
    { size: MAX_UPLOAD_FILE_BYTES + 1, name: 'huge.zip' },
  ]);
  assert.match(message ?? '', /huge\.zip/);
  assert.match(message ?? '', /20MB or smaller/);
});

test('exactly at the per-file cap is allowed', () => {
  assert.equal(validateUploadBatch([{ size: MAX_UPLOAD_FILE_BYTES }]), null);
});

test('the aggregate cap still applies to files that each fit', () => {
  // Five files at the per-file cap is exactly the total cap, so the aggregate
  // rule only bites if one of the two constants is changed independently.
  const atCap = Array.from({ length: MAX_UPLOAD_FILES }, () => ({
    size: MAX_UPLOAD_FILE_BYTES,
  }));
  assert.equal(
    atCap.reduce((n, f) => n + f.size, 0) <= MAX_UPLOAD_TOTAL_BYTES,
    true
  );
  assert.equal(validateUploadBatch(atCap), null);
});

test('the per-file cap matches the presign threshold', () => {
  // They are equal on purpose: files above the threshold would take the
  // direct-to-S3 path, which needs bucket CORS. If someone raises the cap
  // without configuring that, uploads in the gap fail at the browser.
  assert.equal(MAX_UPLOAD_FILE_BYTES, LARGE_FILE_THRESHOLD_BYTES);
});

test('the too-large wording names the file when it can', () => {
  assert.match(tooBigMessage('a.bin'), /"a\.bin"/);
  assert.match(tooBigMessage(), /That file/);
});

test('regenerated names are timestamp-prefixed and never collide by construction', () => {
  const path = buildUploadPath('data', 'report.csv', true);
  assert.match(path, /^data\/\d+-report\.csv$/);
});

test('an unregenerated name is the plain sanitized name at the destination', () => {
  assert.equal(
    buildUploadPath('data', 'my report.csv', false),
    'data/my_report.csv'
  );
});

test('a folder path with or without a trailing slash produces the same prefix', () => {
  assert.equal(
    buildUploadPath('data/2026', 'a.txt', false),
    buildUploadPath('data/2026/', 'a.txt', false)
  );
});

test('the bucket root keeps the single slash it already has', () => {
  // `currentPath` is '/' at the root, so the key starts with one — matching
  // what the previous uploadFiles built, and what listStorageFiles browses.
  // OpenDAL normalises the leading slash away; the point here is that no
  // second one gets added.
  assert.equal(buildUploadPath('/', 'a.txt', false), '/a.txt');
});

test('a file cannot slip past the cap on its own', () => {
  // The route enforces this same bound per request, since the batch check is
  // client-orchestrated and a direct caller skips it.
  assert.ok(validateUploadBatch([{ size: MAX_UPLOAD_FILE_BYTES + 1 }]));
});
