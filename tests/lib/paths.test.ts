// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  basename,
  folderPrefix,
  joinFolder,
  parentPrefix,
} from '../../lib/utils.ts';

test('basename ignores a trailing slash', () => {
  assert.equal(basename('a/b/c.txt'), 'c.txt');
  assert.equal(basename('a/b/c/'), 'c');
  assert.equal(basename('top-level.txt'), 'top-level.txt');
  assert.equal(basename('solo/'), 'solo');
});

test('parentPrefix keeps the trailing slash, and is empty at the root', () => {
  assert.equal(parentPrefix('a/b/c.txt'), 'a/b/');
  assert.equal(parentPrefix('a/b/c/'), 'a/b/');
  assert.equal(parentPrefix('root.txt'), '');
});

test('every spelling of one folder normalises to the same prefix', () => {
  // The app has three: '/' from a fresh URL, 'a/b' from ?path=, and 'a/b/'
  // from a listing's entry.path(). A destination check compares these.
  assert.equal(folderPrefix('a/b'), 'a/b/');
  assert.equal(folderPrefix('a/b/'), 'a/b/');
  assert.equal(folderPrefix('/a/b'), 'a/b/');
  assert.equal(folderPrefix('/'), '');
  assert.equal(folderPrefix(''), '');
});

test('joinFolder puts a name inside a folder without doubling slashes', () => {
  assert.equal(joinFolder('a/b', 'c.txt'), 'a/b/c.txt');
  assert.equal(joinFolder('a/b/', 'c.txt'), 'a/b/c.txt');
  assert.equal(joinFolder('/', 'c.txt'), 'c.txt');
  assert.equal(joinFolder('', 'c.txt'), 'c.txt');
});

test('a folder is detected as living inside itself', () => {
  // The self-nesting guard both the picker and the server action run: moving
  // "a/b" into "a/b/c" would make the walk generate its own input.
  const source = folderPrefix('a/b');
  assert.equal(folderPrefix('a/b/c').startsWith(source), true);
  assert.equal(folderPrefix('a/b').startsWith(source), true);
  assert.equal(folderPrefix('a/bc').startsWith(source), false);
  assert.equal(folderPrefix('a').startsWith(source), false);
});

test('a move that lands where the item already is is a no-op', () => {
  const file = 'docs/2026/report.pdf';
  assert.equal(folderPrefix('docs/2026') === parentPrefix(file), true);
  assert.equal(folderPrefix('/docs/2026/') === parentPrefix(file), true);
  assert.equal(folderPrefix('docs') === parentPrefix(file), false);
});

test('the destination key a copy/move produces keeps the source name', () => {
  assert.equal(joinFolder('archive', basename('docs/a.txt')), 'archive/a.txt');
  assert.equal(joinFolder('/', basename('docs/sub/')), 'sub');
});
