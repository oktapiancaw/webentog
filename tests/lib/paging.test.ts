// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PAGE_SIZE,
  pageWindow,
  parsePagingParams,
  walkCursorStack,
} from '../../lib/utils.ts';

const parse = (qs: string) => parsePagingParams(new URLSearchParams(qs));

test('empty params are page 1 at the default size', () => {
  assert.deepEqual(parse(''), { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
});

test('page is 1-indexed in the URL, 0-indexed in the app', () => {
  assert.equal(parse('page=3').pageIndex, 2);
});

test('junk or out-of-range pages fall back to the first page', () => {
  for (const qs of ['page=0', 'page=-4', 'page=abc', 'page=', 'page=1']) {
    assert.equal(parse(qs).pageIndex, 0, qs);
  }
});

test('an offered size is honoured', () => {
  assert.equal(parse('size=100').pageSize, 100);
});

test('a size outside the offered set cannot force a huge listing', () => {
  for (const qs of ['size=999999', 'size=0', 'size=-20', 'size=abc']) {
    assert.equal(parse(qs).pageSize, DEFAULT_PAGE_SIZE, qs);
  }
});

test('a short run of pages is listed whole, no gaps', () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
});

test('long runs elide to first, neighbours, last', () => {
  assert.deepEqual(pageWindow(1, 20), [1, 2, 'gap', 20]);
  assert.deepEqual(pageWindow(10, 20), [1, 'gap', 9, 10, 11, 'gap', 20]);
  assert.deepEqual(pageWindow(20, 20), [1, 'gap', 19, 20]);
});

test('a gap standing in for one page shows the page instead', () => {
  // 1 [gap] 3 4 5 [gap] 7 would hide exactly one page on each side.
  assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('a current page outside the range is clamped, not rendered', () => {
  assert.deepEqual(pageWindow(99, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(0, 3), [1, 2, 3]);
});

test('span widens the neighbourhood', () => {
  assert.deepEqual(pageWindow(10, 20, 2), [
    1,
    'gap',
    8,
    9,
    10,
    11,
    12,
    'gap',
    20,
  ]);
});

/** Cursor-mode lister over `pages` cursors: page i is reached by cursor c{i}. */
const cursorLister = (pages: number) => {
  const seen: (string | null)[] = [];
  return {
    seen,
    list: async (cursor: string | null) => {
      seen.push(cursor);
      const index = cursor === null ? 0 : Number(cursor.slice(1));
      return {
        mode: 'cursor',
        nextCursor: index + 1 < pages ? `c${index + 1}` : null,
      };
    },
  };
};

test('walk records the cursor for every page up to the target', async () => {
  const { list, seen } = cursorLister(10);
  const { stack, buffered } = await walkCursorStack(list, 3);
  assert.deepEqual(stack, [null, 'c1', 'c2', 'c3']);
  assert.equal(buffered, false);
  // Pages 0..2 listed for their cursors; page 3 is left to the caller.
  assert.deepEqual(seen, [null, 'c1', 'c2']);
});

test('target 0 walks nothing', async () => {
  const { list, seen } = cursorLister(10);
  assert.deepEqual(await walkCursorStack(list, 0), {
    stack: [null],
    buffered: false,
  });
  assert.deepEqual(seen, []);
});

test('walk stops at the last real page when the data shrank', async () => {
  const { list } = cursorLister(3); // pages 0,1,2 exist; the link claims 7
  const { stack, buffered } = await walkCursorStack(list, 6);
  assert.deepEqual(stack, [null, 'c1', 'c2']);
  assert.equal(buffered, false);
});

test('a buffered folder stops the walk on the first listing', async () => {
  const seen: (string | null)[] = [];
  const { stack, buffered } = await walkCursorStack(async (cursor) => {
    seen.push(cursor);
    return { mode: 'buffered', nextCursor: null };
  }, 5);
  assert.deepEqual(stack, [null]);
  assert.equal(buffered, true);
  assert.deepEqual(seen, [null]);
});
