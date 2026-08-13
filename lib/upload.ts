// Copyright (C) 2026 Oktapiancaw

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Upload limits and path building, shared by the client form, the streamed
 * route, and the presigned-URL action — one place, so the three transports
 * cannot silently disagree on what "too big" or "the destination key" means.
 */

export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_TOTAL_BYTES = 100 * 1024 * 1024;

/**
 * Above this, a file goes straight to S3 via a presigned PUT instead of
 * through `/api/upload`.
 */
export const LARGE_FILE_THRESHOLD_BYTES = 20 * 1024 * 1024;

/**
 * The largest single file that may be uploaded.
 *
 * Equal to the presign threshold on purpose: the direct-to-S3 path needs a
 * CORS rule on the bucket allowing PUT from this app's origin, which this app
 * cannot configure and most buckets do not have. Rather than let someone pick
 * a 50MB file and only find out it is impossible after the transfer fails,
 * the limit stops it at selection time with a reason.
 *
 * Raise this above LARGE_FILE_THRESHOLD_BYTES once the bucket has that CORS
 * rule, and files in between will take the presigned path.
 */
export const MAX_UPLOAD_FILE_BYTES = LARGE_FILE_THRESHOLD_BYTES;

/**
 * Checks a whole selected batch against the count and aggregate-size limits.
 *
 * Pure and framework-free so it runs identically in the zod schema (instant
 * client feedback) and as a server-side pre-flight before any request goes
 * out — the only place a "5 files, 100MB total" rule can actually be
 * enforced, since upload is now one request per file and by the time file 5
 * arrives files 1-4 have already succeeded.
 */
export function validateUploadBatch(
  files: { size: number; name?: string }[]
): string | null {
  if (files.length === 0) return 'Pick at least one file to upload.';
  if (files.length > MAX_UPLOAD_FILES) {
    return `Please select up to ${MAX_UPLOAD_FILES} files.`;
  }

  const tooBig = files.find((f) => f.size > MAX_UPLOAD_FILE_BYTES);
  if (tooBig) return tooBigMessage(tooBig.name);

  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_UPLOAD_TOTAL_BYTES) {
    return `Total upload size must be ${mb(MAX_UPLOAD_TOTAL_BYTES)}MB or less.`;
  }
  return null;
}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** One wording for the per-file cap, wherever it is reported. */
export function tooBigMessage(fileName?: string): string {
  const subject = fileName
    ? `"${fileName}" is too large`
    : 'That file is too large';
  return `${subject}. Each file must be ${mb(MAX_UPLOAD_FILE_BYTES)}MB or smaller.`;
}

/**
 * The destination key for an upload.
 *
 * Regenerated (the default): timestamp-prefixed, so it can never collide with
 * an existing object. Not regenerated: the plain sanitized name — an S3 PUT
 * to an existing key overwrites it, and that is the point of unchecking the
 * box, not a bug to guard against here.
 */
export function buildUploadPath(
  folderPath: string,
  fileName: string,
  regenerateName: boolean
): string {
  const safeName = fileName.replace(/\s+/g, '_');
  const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  return regenerateName
    ? `${prefix}${Date.now()}-${safeName}`
    : `${prefix}${safeName}`;
}
