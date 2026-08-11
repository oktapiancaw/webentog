// Run: npm test
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { copyToClipboard } from '../../lib/utils.ts';

/**
 * Minimal DOM stubs. Node exposes a read-only global `navigator`, so every
 * global here goes through defineProperty rather than assignment.
 */
function stubDom(opts: {
  secure: boolean;
  clipboard?: { writeText: (t: string) => Promise<void> };
  execCommand?: () => boolean;
}) {
  const appended: string[] = [];
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    focus() {},
    select() {},
  };

  const define = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });

  define('navigator', opts.clipboard ? { clipboard: opts.clipboard } : {});
  define('window', { isSecureContext: opts.secure });
  define('document', {
    createElement: () => textarea,
    body: {
      appendChild: () => appended.push(textarea.value),
      removeChild: () => {},
    },
    execCommand:
      opts.execCommand ??
      (() => {
        throw new Error('execCommand unavailable');
      }),
  });

  return { textarea, appended };
}

afterEach(() => {
  for (const key of ['navigator', 'window', 'document']) {
    Reflect.deleteProperty(globalThis, key);
  }
});

test('uses the clipboard API in a secure context', async () => {
  let written = '';
  stubDom({
    secure: true,
    clipboard: {
      async writeText(t) {
        written = t;
      },
    },
    execCommand: () => {
      throw new Error('should not reach the fallback');
    },
  });

  assert.equal(await copyToClipboard('s3://bucket/key.json'), true);
  assert.equal(written, 's3://bucket/key.json');
});

test('falls back when the clipboard API rejects', async () => {
  const { appended } = stubDom({
    secure: true,
    clipboard: {
      writeText: () => Promise.reject(new Error('denied')),
    },
    execCommand: () => true,
  });

  assert.equal(await copyToClipboard('denied-then-copied'), true);
  assert.deepEqual(appended, ['denied-then-copied']);
});

test('skips the clipboard API outside a secure context', async () => {
  // The reported case: plain HTTP on a LAN address, where the API is absent.
  const { appended } = stubDom({ secure: false, execCommand: () => true });

  assert.equal(await copyToClipboard('http-deploy'), true);
  assert.deepEqual(appended, ['http-deploy']);
});

test('reports failure instead of a false success', async () => {
  // Callers show toast.success on true, so a refused copy must return false.
  stubDom({ secure: false, execCommand: () => false });
  assert.equal(await copyToClipboard('refused'), false);

  stubDom({ secure: false }); // execCommand throws
  assert.equal(await copyToClipboard('throws'), false);
});
