// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainError } from '../../lib/utils.ts';

const FALLBACK = 'Could not list this folder.';

test('the real OpenDAL transport failure becomes a sentence', () => {
  // Verbatim from a production log: this is what used to reach the UI.
  const raw = new Error(
    'Unexpected (temporary) at list, context: { url: http://192.168.1.9:8000/datalake?list-type=2&prefix=data/, called: reqwest::send, service: s3 } => send http request, source: error sending request'
  );
  const { message, unexpected } = explainError(raw, FALLBACK);
  assert.match(message, /Could not reach the storage endpoint/);
  assert.equal(unexpected, true);
  // None of the request internals survive into the UI.
  assert.doesNotMatch(message, /reqwest|http:\/\/|context:|service: s3/);
});

test("React's production stub does not reach the user", () => {
  const raw = new Error(
    'Minified React error #441; visit https://react.dev/errors/441 for the full message'
  );
  const { message, unexpected } = explainError(raw, FALLBACK);
  assert.equal(message, 'The server hit an error handling that request.');
  assert.equal(unexpected, true);
  assert.doesNotMatch(message, /441|react\.dev/);
});

test('a denied credential says so, and is not reported as a bug', () => {
  const { message, unexpected } = explainError(
    new Error(
      'PermissionDenied (permanent) at delete, context: { service: s3 }'
    ),
    FALLBACK
  );
  assert.match(message, /not allowed/);
  assert.equal(unexpected, false); // no "report this" footer: the user can fix it
});

test('messages this app wrote pass through untouched', () => {
  const ours = 'A folder named "reports" already exists.';
  assert.deepEqual(explainError(new Error(ours), FALLBACK), {
    message: ours,
    unexpected: false,
  });
});

test('a stack trace falls back instead of being shown', () => {
  const raw = new Error(
    'kaboom\n    at Object.<anonymous> (/app/server.js:1:1)'
  );
  assert.equal(explainError(raw, FALLBACK).message, FALLBACK);
});

test('an over-long message falls back rather than filling the toast', () => {
  assert.equal(
    explainError(new Error('x'.repeat(400)), FALLBACK).message,
    FALLBACK
  );
});

test('non-Error throws do not crash the classifier', () => {
  assert.equal(explainError(undefined, FALLBACK).message, FALLBACK);
  assert.equal(explainError(null, FALLBACK).message, FALLBACK);
  assert.equal(explainError({}, FALLBACK).message, FALLBACK);
});
