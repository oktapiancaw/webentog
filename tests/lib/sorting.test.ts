// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareFiles, type SortableFile } from '../../lib/utils.ts';

const file = (
  name: string,
  sizeBytes: number | null,
  lastModified: string | null = null,
  type = 'text'
): SortableFile => ({ type, name, sizeBytes, lastModified });

const dir = (name: string): SortableFile => ({
  type: 'folder',
  name,
  sizeBytes: null,
  lastModified: null,
});

const order = (
  rows: SortableFile[],
  column: Parameters<typeof compareFiles>[0],
  direction: Parameters<typeof compareFiles>[1]
) => [...rows].sort(compareFiles(column, direction)).map((r) => r.name);

test('name sorts A to Z, and reverses on desc', () => {
  const rows = [
    file('charlie.txt', 1),
    file('alpha.txt', 2),
    file('bravo.txt', 3),
  ];
  assert.deepEqual(order(rows, 'name', 'asc'), [
    'alpha.txt',
    'bravo.txt',
    'charlie.txt',
  ]);
  assert.deepEqual(order(rows, 'name', 'desc'), [
    'charlie.txt',
    'bravo.txt',
    'alpha.txt',
  ]);
});

test('size sorts by magnitude, not by the formatted string', () => {
  // The rendered strings are "950 KB" and "1.2 MB"; lexicographically the MB
  // one sorts first, which is the bug carrying raw bytes exists to avoid.
  const rows = [file('big.bin', 1_200_000), file('small.bin', 950_000)];
  assert.deepEqual(order(rows, 'size', 'asc'), ['small.bin', 'big.bin']);
  assert.deepEqual(order(rows, 'size', 'desc'), ['big.bin', 'small.bin']);
});

test('last modified sorts oldest first, then newest first', () => {
  const rows = [
    file('new.txt', 1, '2026-08-01T00:00:00Z'),
    file('old.txt', 1, '2020-01-01T00:00:00Z'),
    file('mid.txt', 1, '2024-05-05T00:00:00Z'),
  ];
  assert.deepEqual(order(rows, 'lastModified', 'asc'), [
    'old.txt',
    'mid.txt',
    'new.txt',
  ]);
  assert.deepEqual(order(rows, 'lastModified', 'desc'), [
    'new.txt',
    'mid.txt',
    'old.txt',
  ]);
});

test('folders stay grouped above files whatever the column and direction', () => {
  const rows = [
    file('huge.bin', 9_000_000),
    dir('zzz-folder'),
    file('tiny.bin', 1),
  ];
  for (const direction of ['asc', 'desc'] as const) {
    for (const column of ['name', 'size', 'lastModified'] as const) {
      assert.equal(
        order(rows, column, direction)[0],
        'zzz-folder',
        `${column}/${direction} let a file above the folder`
      );
    }
  }
});

test('an audio file does not outrank a folder', () => {
  // Regression: the old key was type.localeCompare(type), and 'audio' sorts
  // before 'folder' alphabetically, so a folder of mp3s listed its files first.
  const rows = [file('song.mp3', 5, null, 'audio'), dir('albums')];
  assert.deepEqual(order(rows, 'name', 'asc'), ['albums', 'song.mp3']);
  assert.deepEqual(order(rows, 'name', 'desc'), ['albums', 'song.mp3']);
});

test('rows with no size or timestamp stay together instead of scattering', () => {
  const rows = [
    file('known.bin', 500, '2026-01-01T00:00:00Z'),
    file('unknown-a.bin', null, null),
    file('unknown-b.bin', null, null),
  ];
  assert.deepEqual(order(rows, 'size', 'asc').slice(0, 2).sort(), [
    'unknown-a.bin',
    'unknown-b.bin',
  ]);
  assert.equal(order(rows, 'size', 'desc')[0], 'known.bin');
});

test('an unparseable timestamp does not poison the comparison', () => {
  // NaN from new Date('--') would make every comparison false and leave the
  // array in an arbitrary order rather than a wrong-but-defined one.
  const rows = [
    file('bad.txt', 1, 'not-a-date'),
    file('good.txt', 1, '2026-01-01T00:00:00Z'),
  ];
  assert.deepEqual(order(rows, 'lastModified', 'asc'), ['bad.txt', 'good.txt']);
});
