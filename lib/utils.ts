import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getLastNameFromPath = (path: string): string | undefined => {
  const parts = path.split('/').filter(Boolean); // Split by '/' and remove empty parts
  return parts[parts.length - 1]; // Access the last element
};

export type FileType =
  'folder' | 'image' | 'pdf' | 'json' | 'video' | 'audio' | 'text' | 'unknown';

const EXTENSION_TYPES: Record<string, FileType> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  avif: 'image',
  bmp: 'image',
  ico: 'image',
  pdf: 'pdf',
  json: 'json',
  mp4: 'video',
  mkv: 'video',
  avi: 'video',
  mov: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  m4a: 'audio',
  aac: 'audio',
};

/** Extensions rendered as syntax-highlighted text, mapped to their Shiki language. */
const TEXT_LANGUAGES: Record<string, string> = {
  txt: 'text',
  log: 'text',
  env: 'dotenv',
  md: 'markdown',
  mdx: 'mdx',
  csv: 'csv',
  tsv: 'csv',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  js: 'javascript',
  mjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  dockerfile: 'docker',
};

export const getExtension = (name: string): string => {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

export function fileTypeFromName(name: string): FileType {
  const ext = getExtension(name);
  return EXTENSION_TYPES[ext] ?? (ext in TEXT_LANGUAGES ? 'text' : 'unknown');
}

/** Shiki language id for a file name; falls back to plain text. */
export function languageFromName(name: string): string {
  const ext = getExtension(name);
  if (ext === 'json') return 'json';
  return TEXT_LANGUAGES[ext] ?? 'text';
}

/**
 * Builds the S3 `StartAfter` key that resumes listing after `key`.
 *
 * For a file the key itself is exact. For a folder it is not: `StartAfter` is
 * compared against object keys, and every object under `logs/2026/` sorts
 * strictly after the string `logs/2026/` — so S3 returns that subtree again,
 * collapses it back into the same CommonPrefix, and the folder repeats forever.
 *
 * Incrementing the final byte yields the smallest key past the whole subtree:
 * `logs/2026/` -> `logs/20260` ('/' 0x2F -> '0' 0x30). Any key under the folder
 * still starts with `logs/2026/`, which is strictly less at that byte position.
 * Safe because S3 orders keys by UTF-8 bytes.
 */
export function cursorAfterKey(key: string, isFolder: boolean): string {
  if (!isFolder || key.length === 0) return key;
  const lastByte = key.charCodeAt(key.length - 1);
  return key.slice(0, -1) + String.fromCharCode(lastByte + 1);
}

/**
 * True when a storage error is the endpoint refusing on credentials rather
 * than anything the app did wrong.
 *
 * OpenDAL flattens the cause into the message (`PermissionDenied (permanent)
 * at delete, context: {...}`), so matching the text is the only handle the
 * Node binding gives — same approach as [[classifyVersionListFailure]].
 */
export function isPermissionDenied(error: unknown): boolean {
  return /AccessDenied|PermissionDenied|Forbidden|\b403\b/i.test(String(error));
}

/**
 * Validates one path segment typed by a user — a new folder name, or the new
 * name in a rename. Returns null when it is fine, else why not.
 *
 * A `/` is the whole point of this check: without it "rename" silently becomes
 * "move anywhere in the bucket", including out of the folder the user is
 * looking at. Server actions are a public endpoint, so this runs there too and
 * not only in the dialog.
 */
export function validateObjectName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name cannot be empty.';
  if (trimmed === '.' || trimmed === '..') return 'Name cannot be "." or "..".';
  if (trimmed.includes('/')) return 'Name cannot contain "/".';

  if (/[\u0000-\u001f\u007f]/.test(trimmed))
    return 'Name cannot contain control characters.';
  // S3 keys cap at 1024 bytes total; one segment past 255 is a mistake, not a
  // use case, and leaves room for the prefix.
  if (new TextEncoder().encode(trimmed).length > 255)
    return 'Name is too long (max 255 bytes).';
  return null;
}

/** Replaces the last segment of `key`, keeping its parent prefix. */
export function replaceLastSegment(key: string, name: string): string {
  const stripped = key.endsWith('/') ? key.slice(0, -1) : key;
  const cut = stripped.lastIndexOf('/');
  const parent = cut === -1 ? '' : stripped.slice(0, cut + 1);
  return `${parent}${name}${key.endsWith('/') ? '/' : ''}`;
}

/** Rows-per-page choices, and the allowlist for `?size=`. */
export const PAGE_SIZES = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Reads `?page=` / `?size=`, which are whatever someone typed in the address
 * bar. `size` is allowlisted to the offered choices, since an unbounded one
 * turns a shared link into a full-bucket scan; `page` is 1-indexed in the URL
 * to match the "Page N" label and comes back as a non-negative index.
 */
export function parsePagingParams(params: URLSearchParams): {
  pageIndex: number;
  pageSize: number;
} {
  const size = Number(params.get('size'));
  const page = Number(params.get('page'));
  return {
    pageSize: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
    pageIndex: page > 1 ? Math.floor(page) - 1 : 0,
  };
}

/**
 * Page numbers to render, with `'gap'` where a run was elided: first page,
 * last page, and `span` either side of the current one.
 *
 * Both `current` and `total` are 1-indexed, matching the button labels.
 */
export function pageWindow(
  current: number,
  total: number,
  span = 1
): (number | 'gap')[] {
  if (total <= 1) return [1];
  const here = Math.min(Math.max(current, 1), total);
  const shown = new Set([1, total]);
  for (let p = here - span; p <= here + span; p++) {
    if (p >= 1 && p <= total) shown.add(p);
  }

  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of [...shown].sort((a, b) => a - b)) {
    // A gap standing in for a single page wastes the space it saves.
    if (prev && p - prev === 2) out.push(prev + 1);
    else if (prev && p - prev > 2) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Walks a listing forward to `target`, recording the cursor that produced each
 * page. Object-storage cursors are positional, so page N is only reachable by
 * listing pages 0..N-1 — there is no jump. Stops early when the data ends
 * (objects removed since the link was made) or when the folder turns out to be
 * buffered, where paging is a local slice and there are no cursors at all.
 */
export async function walkCursorStack(
  list: (
    cursor: string | null
  ) => Promise<{ mode: string; nextCursor: string | null }>,
  target: number
): Promise<{ stack: (string | null)[]; buffered: boolean }> {
  const stack: (string | null)[] = [null];
  let cursor: string | null = null;
  for (let i = 0; i < target; i++) {
    const { mode, nextCursor } = await list(cursor);
    if (mode === 'buffered') return { stack, buffered: true };
    if (!nextCursor) break;
    cursor = nextCursor;
    stack.push(cursor);
  }
  return { stack, buffered: false };
}

/**
 * Copies text, falling back for non-HTTPS deploys.
 *
 * navigator.clipboard exists only in a secure context, so a container served
 * over plain HTTP on a LAN address has no clipboard API at all. The deprecated
 * execCommand textarea trick still works there.
 *
 * Returns whether the copy landed, since writeText can reject.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Keep it off-screen and unfocusable to the eye, but still selectable.
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export interface VersionListFailure {
  reason: 'denied' | 'unsupported';
  detail: string;
}

/**
 * Classifies a failed `?versions` listing.
 *
 * Ceph RGW and MinIO answer 403 AccessDenied when the key lacks
 * ListBucketVersions, and 501 NotImplemented when the gateway has no
 * versioning support. Neither deserves a crash — the object is still readable —
 * so both degrade to showing the current version only. Returns null for
 * anything else, which the caller rethrows.
 */
export function classifyVersionListFailure(
  error: unknown
): VersionListFailure | null {
  const text = String(error);
  if (/AccessDenied|PermissionDenied|\b403\b/i.test(text))
    return {
      reason: 'denied',
      detail: 'These credentials cannot list object versions.',
    };
  if (/NotImplemented|Unsupported|\b501\b/i.test(text))
    return {
      reason: 'unsupported',
      detail: 'This storage endpoint does not support version listing.',
    };
  return null;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Formats a byte count for display.
 *
 * Hand-rolled rather than Intl compact notation: that renders 10^9 as "10B"
 * (billion) and then appends the byte unit "B", so a 9.5 GB object read
 * "9.5BB". Stepping through explicit units avoids the collision entirely.
 *
 * Takes BYTES — `metadata.contentLength` straight from the SDK.
 */
export function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  // Whole bytes never need a decimal; above that one decimal keeps the column
  // narrow while still separating 1.2 MB from 1.9 MB.
  const decimals = unit === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${SIZE_UNITS[unit]}`;
}
