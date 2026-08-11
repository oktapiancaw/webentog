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
