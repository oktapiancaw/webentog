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
'use server';

import type { Operator } from 'opendal';
import { getOperator } from '@/lib/opendal';
import { getDb } from '@/lib/db';
import {
  classifyVersionListFailure,
  cursorAfterKey,
  fileTypeFromName,
  formatStorage,
  isPermissionDenied,
  replaceLastSegment,
  validateObjectName,
  type FileType,
} from '@/lib/utils';

export interface ConnectionConfig {
  id?: number;
  name?: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

/**
 * Insert, or update when `config` carries an id.
 *
 * The id branch is the whole point: without it every edit inserted a second
 * row. `connections` has no unique key other than the primary one, so there is
 * nothing for an `ON CONFLICT` upsert to match on — this has to be an explicit
 * branch.
 */
export async function saveConnection(config: ConnectionConfig) {
  try {
    const { id, name, endpoint, accessKey, secretKey, bucket, region } = config;
    const db = getDb();
    const values = [
      name || 'Unnamed Connection',
      endpoint,
      accessKey,
      secretKey,
      bucket,
      region,
    ];

    if (id) {
      const result = db
        .prepare(
          `UPDATE connections
             SET name = ?, endpoint = ?, accessKey = ?, secretKey = ?, bucket = ?, region = ?
           WHERE id = ?`
        )
        .run(...values, id);
      // Falling back to an INSERT here would answer "this row is gone" by
      // quietly making a new one under a different id, which is the duplicate
      // bug again wearing a different hat.
      if (result.changes === 0) {
        throw new Error(
          'This connection no longer exists. It may have been deleted in another tab.'
        );
      }
      return { id };
    }

    const result = db
      .prepare(
        `INSERT INTO connections (name, endpoint, accessKey, secretKey, bucket, region)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(...values);
    return { id: result.lastInsertRowid };
  } catch (error) {
    console.error('Save Connection Error:', error);
    throw error instanceof Error &&
      error.message.startsWith('This connection no longer exists')
      ? error
      : new Error('Failed to save connection.');
  }
}

/**
 * Probes a set of credentials with the cheapest real round trip there is: one
 * listing of one key. Proves the endpoint resolves, the credentials sign, and
 * the bucket is reachable.
 *
 * Takes the form's fields rather than a saved id, so an unsaved connection can
 * be tested before committing it. Returns a result instead of throwing —
 * failing is the expected half of a probe, not an exception.
 */
export async function testConnection(
  config: ConnectionConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const op = getOperator(config);
    await op.list('', { limit: 1 });
    return { success: true };
  } catch (error) {
    console.error('Test Connection Error:', error);
    // A 403 means the endpoint answered, so the address is right — but S3
    // returns 403 both for a bad secret and for a policy that simply does not
    // cover the bucket root, and the two are not reliably distinguishable from
    // here. Say what is actually known instead of guessing at "wrong password".
    if (isPermissionDenied(error)) {
      return {
        success: false,
        error:
          'Reached the endpoint, but the credentials were refused. Either the keys are wrong, or they are not allowed to list this bucket at its root — a key scoped to one prefix can still fail this test and work for browsing.',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Could not connect.',
    };
  }
}

export async function getConnections(): Promise<ConnectionConfig[]> {
  try {
    const stmt = getDb().prepare(
      'SELECT * FROM connections ORDER BY created_at DESC'
    );
    return stmt.all() as ConnectionConfig[];
  } catch (error) {
    console.error('Get Connections Error:', error);
    return [];
  }
}

export async function deleteConnection(id: number) {
  try {
    const stmt = getDb().prepare('DELETE FROM connections WHERE id = ?');
    stmt.run(id);
    return { success: true };
  } catch (error) {
    console.error('Delete Connection Error:', error);
    throw new Error('Failed to delete connection.');
  }
}
export async function uploadFiles(
  config: ConnectionConfig,
  formData: FormData,
  folderPath: string
) {
  const op = getOperator(config);

  const files = formData.getAll('files') as File[];
  if (!files.length) throw new Error('No files provided');

  const results = [];
  const folderPath_ = folderPath.endsWith('/') ? folderPath : folderPath + '/';

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error(`${file.name} is too large`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${folderPath_}${Date.now()}-${file.name.replace(/\s+/g, '_')}`;

    try {
      await op.write(path, buffer);
      results.push({ name: file.name, path, success: true });
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
      results.push({ name: file.name, success: false });
    }
  }

  return { success: results.some((r) => r.success), uploads: results };
}
export interface FormattedFile {
  id: string;
  name: string;
  fullPath: string;
  type: FileType;
  size: string;
  lastModified: string | null;
}

/**
 * `buffered`: whole folder at once, sorted folders-first, paged in memory.
 * `cursor`: too big to buffer, one page per request via S3 StartAfter.
 */
export type ListMode = 'buffered' | 'cursor';

export interface ListStorageFilesResult {
  items: FormattedFile[];
  /** S3 StartAfter key for the next page. Null when the folder is exhausted. */
  nextCursor: string | null;
  mode: ListMode;
  /**
   * Cursor mode, first page only: subfolders found during the discovery walk.
   * The client pins them above the file pages so they do not fall off the end.
   * Empty in buffered mode, where `items` already holds them.
   */
  folders: FormattedFile[];
  /** True when the walk hit its cap, so `folders` may be incomplete. */
  foldersTruncated: boolean;
}

/** Display order: folders first, then by name. */
const byTypeThenName = (a: FormattedFile, b: FormattedFile) =>
  a.type.localeCompare(b.type) || a.name.localeCompare(b.name);

/**
 * Lists a directory: buffers small folders, cursor-pages large ones.
 *
 * S3 returns keys in order and interleaves subfolder prefixes with files, so a
 * page-local sort scatters folders across pages. Buffering under the threshold
 * keeps folders-first ordering where it costs little.
 */
export async function listStorageFiles(
  config: ConnectionConfig,
  path: string,
  options?: { cursor?: string | null; limit?: number; bufferThreshold?: number }
): Promise<ListStorageFilesResult> {
  const limit = options?.limit ?? 20;
  // First load walks threshold+1 entries before it can answer, so this sets the
  // latency floor for every folder. Higher buys folders-first ordering on bigger
  // directories and costs a slower first paint.
  const bufferThreshold = options?.bufferThreshold ?? 100;
  const cursor = options?.cursor ?? null;
  const isFirstPage = cursor === null;

  try {
    const op = getOperator(config);

    // First page walks threshold+1 to decide buffered vs cursor; the +1 proves
    // the folder is over the line. Later pages need limit+1 as a look-ahead.
    const budget = isFirstPage ? bufferThreshold + 1 : limit + 1;

    // ListOptions.limit is the per-request batch size (S3 MaxKeys), not our page
    // size; the loop below enforces page boundaries. Sizing it to the walk keeps
    // first load near 2 round trips. 1000 is S3's maximum.
    const batchSize = Math.min(budget, 1000);

    const lister = await op.lister(path, {
      limit: batchSize,
      startAfter: cursor ?? undefined,
      recursive: false,
    });

    const collected: FormattedFile[] = [];
    let entry;
    while (
      collected.length < budget &&
      (entry = await lister.next()) !== null
    ) {
      const pathString = entry.path();
      // The self-entry isn't a child, so it must not consume a slot.
      if (pathString === path) continue;

      const metadata = entry.metadata();
      const fileType: FileType = metadata.isDirectory()
        ? 'folder'
        : fileTypeFromName(pathString);
      const sizeFile = metadata.contentLength
        ? formatStorage(Number(metadata.contentLength))
        : '--';
      const name = pathString.split('/').filter(Boolean).pop() || 'unknown';

      collected.push({
        id: pathString,
        name,
        fullPath: `${config.endpoint}/${config.bucket}/${pathString}`,
        type: fileType,
        size: sizeFile,
        lastModified: metadata.lastModified,
      });
    }

    // Whole folder fits: sort globally, no cursor needed.
    if (isFirstPage && collected.length <= bufferThreshold) {
      return {
        items: collected.sort(byTypeThenName),
        nextCursor: null,
        mode: 'buffered',
        folders: [],
        foldersTruncated: false,
      };
    }

    const hasMore = collected.length > limit;
    const page = collected.slice(0, limit);

    // Cursor comes from LISTING order, before the display sort. Sorting first
    // would return a key S3 did not end on, skipping or repeating entries.
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? cursorAfterKey(last.id, last.type === 'folder') : null;

    // Harvest subfolders from the walk instead of dropping them with the rest of
    // the slice. First page only; later pages walk limit+1 and the client keeps
    // the list it has.
    const folders = isFirstPage
      ? collected.filter((e) => e.type === 'folder').sort(byTypeThenName)
      : [];

    return {
      items: [...page].sort(byTypeThenName),
      nextCursor,
      mode: 'cursor',
      folders,
      foldersTruncated: isFirstPage && collected.length >= budget,
    };
  } catch (error) {
    console.error('OpenDAL Error:', error);
    throw new Error('Failed to connect or list files.');
  }
}

/**
 * Counts direct children, keeping only the tally. The one full traversal in the
 * app, so it runs on explicit user request.
 *
 * `capped` means the walk hit `maxScan` and the UI shows "5000+" rather than a
 * count it never finished.
 */
export async function countFolderObjects(
  config: ConnectionConfig,
  path: string,
  maxScan = 5000
): Promise<{ count: number; capped: boolean }> {
  try {
    const op = getOperator(config);

    const lister = await op.lister(path, { recursive: false });

    let count = 0;
    let entry;
    while (count < maxScan && (entry = await lister.next()) !== null) {
      if (entry.path() === path) continue; // self-entry isn't a child
      count++;
    }

    return { count, capped: count >= maxScan };
  } catch (error) {
    console.error('Count Objects Error:', error);
    throw new Error('Failed to count objects.');
  }
}

export async function getDownloadUrl(config: ConnectionConfig, path: string) {
  try {
    const op = getOperator(config);

    const req = await op.presignRead(path, 3600);

    return req.url;
  } catch (error) {
    console.error('Presign URL Error:', error);
    throw new Error('Failed to generate download link.');
  }
}

export interface ObjectMetadata {
  size: string;
  contentLength: number | null;
  lastModified: string | null;
  etag: string | null;
  contentType: string | null;
  version: string | null;
}

/**
 * Stats one object when a preview opens. Kept out of `listStorageFiles`, where
 * it would cost one stat per row.
 */
export async function getObjectMetadata(
  config: ConnectionConfig,
  path: string
): Promise<ObjectMetadata> {
  try {
    const op = getOperator(config);

    const meta = await op.stat(path);
    const contentLength =
      meta.contentLength !== null ? Number(meta.contentLength) : null;

    return {
      size: contentLength !== null ? formatStorage(contentLength) : '--',
      contentLength,
      lastModified: meta.lastModified,
      etag: meta.etag,
      contentType: meta.contentType,
      version: meta.version,
    };
  } catch (error) {
    console.error('Stat Object Error:', error);
    throw new Error('Failed to read object metadata.');
  }
}

export interface ObjectVersion {
  versionId: string | null;
  lastModified: string | null;
  size: string;
  etag: string | null;
  isDeleted: boolean;
  /**
   * Heuristic: newest by lastModified. OpenDAL exposes no is-current flag, so
   * do not treat this as authoritative.
   */
  isLikelyCurrent: boolean;
}

export interface ListObjectVersionsResult {
  versions: ObjectVersion[];
  /**
   * True when more than one version came back. Drives the Restore warning only.
   * The SDK exposes no way to check whether bucket versioning is on.
   */
  likelyVersioned: boolean;
  /**
   * Set when version listing could not run. `versions` then holds at most the
   * current object from stat(). Listing needs bucket-scoped
   * s3:ListBucketVersions, so it can fail while previews still work.
   */
  unavailable?: { reason: 'denied' | 'unsupported'; detail: string };
}

/**
 * Parent directory of an S3 key. Not `node:path`: keys use '/' on every host OS,
 * and each function here takes a `path` parameter that shadows the import.
 */
function dirOf(key: string): string {
  const lastSlash = key.lastIndexOf('/');
  return lastSlash === -1 ? '' : key.slice(0, lastSlash + 1);
}

/** Best-effort single row for the live object, used when listing is refused. */
async function currentVersionOnly(
  op: InstanceType<typeof Operator>,
  path: string
): Promise<ObjectVersion[]> {
  try {
    const meta = await op.stat(path);
    const contentLength =
      meta.contentLength !== null ? Number(meta.contentLength) : null;
    return [
      {
        versionId: meta.version,
        lastModified: meta.lastModified,
        size: contentLength !== null ? formatStorage(contentLength) : '--',
        etag: meta.etag,
        isDeleted: false,
        isLikelyCurrent: true,
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Lists every version of one object.
 *
 * OpenDAL exposes `versions: true` at directory scope only, so this lists the
 * parent and filters to the target key. When ListBucketVersions is refused it
 * degrades to the current object instead of failing the dialog.
 */
export async function listObjectVersions(
  config: ConnectionConfig,
  path: string
): Promise<ListObjectVersionsResult> {
  const op = getOperator(config);

  try {
    const lister = await op.lister(dirOf(path), {
      versions: true,
      recursive: false,
    });

    const versions: ObjectVersion[] = [];
    let entry;
    while ((entry = await lister.next()) !== null) {
      if (entry.path() !== path) continue;

      const meta = entry.metadata();
      const contentLength =
        meta.contentLength !== null ? Number(meta.contentLength) : null;

      versions.push({
        versionId: meta.version,
        lastModified: meta.lastModified,
        size: contentLength !== null ? formatStorage(contentLength) : '--',
        etag: meta.etag,
        isDeleted: meta.isDeleted(),
        isLikelyCurrent: false,
      });
    }

    // Newest first. Entries with no timestamp sink to the bottom instead of
    // counting as epoch-old and stealing the "current" marker.
    versions.sort((a, b) => {
      if (!a.lastModified) return 1;
      if (!b.lastModified) return -1;
      return b.lastModified.localeCompare(a.lastModified);
    });

    if (versions.length > 0) versions[0].isLikelyCurrent = true;

    return { versions, likelyVersioned: versions.length > 1 };
  } catch (error) {
    const unavailable = classifyVersionListFailure(error);
    if (unavailable) {
      // Expected without versioning access: warn and show what we have.
      console.warn('Version listing unavailable:', unavailable.reason);
      return {
        versions: await currentVersionOnly(op, path),
        likelyVersioned: false,
        unavailable,
      };
    }

    console.error('List Versions Error:', error);
    throw new Error('Failed to list object versions.');
  }
}

/**
 * Copies bytes from one version of `path` to `target`.
 *
 * `write` takes no version, so restore is read-then-write. The stat carries
 * `contentType` across; without it every restored object becomes
 * application/octet-stream and stops previewing inline.
 */
async function copyVersionTo(
  op: InstanceType<typeof Operator>,
  path: string,
  versionId: string,
  target: string
) {
  const [bytes, meta] = await Promise.all([
    op.read(path, { version: versionId }),
    op.stat(path, { version: versionId }),
  ]);

  await op.write(target, bytes, {
    ...(meta.contentType ? { contentType: meta.contentType } : {}),
  });
}

/**
 * Writes an old version back over the current key. On a versioned bucket this
 * appends a version and keeps history. Without versioning it overwrites for
 * good, which the UI warns about first.
 */
export async function restoreObjectVersion(
  config: ConnectionConfig,
  path: string,
  versionId: string
): Promise<{ success: true }> {
  try {
    const op = getOperator(config);

    await copyVersionTo(op, path, versionId, path);
    return { success: true };
  } catch (error) {
    console.error('Restore Version Error:', error);
    throw new Error('Failed to restore version.');
  }
}

/** Writes an old version out to a different key, leaving the original alone. */
export async function saveObjectVersionAs(
  config: ConnectionConfig,
  path: string,
  versionId: string,
  newPath: string
): Promise<{ success: true; path: string }> {
  const target = newPath.trim();
  if (!target) throw new Error('Provide a name for the new object.');
  if (target === path)
    throw new Error('Use Restore to overwrite the same path.');

  try {
    const op = getOperator(config);

    // "Save as" promises it never overwrites, so refuse an occupied key. Only a
    // successful stat counts as occupied; a throwing stat falls through.
    let occupied = false;
    try {
      await op.stat(target);
      occupied = true;
    } catch {
      /* nothing there, safe to write */
    }
    if (occupied)
      throw new Error(
        `An object already exists at ${target}. Pick another name.`
      );

    await copyVersionTo(op, path, versionId, target);
    return { success: true, path: target };
  } catch (error) {
    console.error('Save Version As Error:', error);
    // Surface our own validation messages; mask only unexpected SDK failures.
    throw error instanceof Error &&
      error.message.startsWith('An object already exists')
      ? error
      : new Error('Failed to save version as a new object.');
  }
}

export async function deleteFile(config: ConnectionConfig, path: string) {
  try {
    const op = getOperator(config);
    await op.delete(path);
    return { success: true };
  } catch (error) {
    console.error('Delete File Error:', error);
    throw new Error(
      isPermissionDenied(error)
        ? 'These credentials cannot delete objects.'
        : 'Failed to delete file.'
    );
  }
}

export async function createFolder(config: ConnectionConfig, path: string) {
  try {
    const op = getOperator(config);
    await op.createDir(path);
    return { success: true };
  } catch (error) {
    console.error('Create Folder Error:', error);
    throw new Error('Failed to create folder.');
  }
}

/**
 * Deletes a folder and everything under it.
 *
 * `delete` is single-key, so a folder needs `removeAll`. The trailing slash is
 * enforced because `removeAll('a/b')` would also match a sibling key `a/bc`.
 */
export async function deleteFolder(config: ConnectionConfig, path: string) {
  try {
    const op = getOperator(config);
    await op.removeAll(path.endsWith('/') ? path : `${path}/`);
    return { success: true };
  } catch (error) {
    console.error('Delete Folder Error:', error);
    throw new Error(
      isPermissionDenied(error)
        ? 'These credentials cannot delete objects.'
        : 'Failed to delete folder.'
    );
  }
}

/**
 * Renames within the current folder. The caller passes a name, not a path, so
 * a rename cannot turn into a move: the parent prefix comes from `path` here,
 * and the name is validated the same way the dialog validates it. Server
 * actions are reachable without the UI, so this is the check that counts.
 */
const NO_DELETE_PERMISSION =
  'These credentials cannot delete objects, and a rename has to delete the original after copying it. Nothing was changed.';

/**
 * Refuses the rename up front when the credentials cannot delete.
 *
 * Rename is copy-then-delete, so read-plus-write-but-no-delete credentials
 * would copy the object and then fail — leaving a duplicate the same
 * credentials cannot clean up either. DeleteObject against a key that does not
 * exist is the probe: the policy check runs before the existence check, so it
 * returns success when permitted and 403 when not, and removes nothing either
 * way.
 *
 * Any other failure (a network blip) is ignored rather than blocking a rename
 * that would have worked.
 */
async function assertCanDelete(
  op: InstanceType<typeof Operator>,
  prefix: string
) {
  try {
    await op.delete(`${prefix}.webentog-delete-probe`);
  } catch (error) {
    if (isPermissionDenied(error)) throw new Error(NO_DELETE_PERMISSION);
    console.error('Delete permission probe failed (ignored):', error);
  }
}

/**
 * Moves one object. S3 has no rename — OpenDAL reports `rename: false` and
 * `copy: true` for the service — so this is a server-side CopyObject followed
 * by a delete of the original. No bytes travel through the app.
 *
 * Copy first, delete second, on purpose: if it fails in between, the object is
 * duplicated rather than gone.
 *
 * ponytail: single-part copy, which S3 caps at 5GB. Objects past that need a
 * multipart copy the binding does not expose; they fail loudly here rather
 * than truncating.
 */
async function moveObject(
  op: InstanceType<typeof Operator>,
  from: string,
  to: string
) {
  await op.copy(from, to);
  await op.delete(from);
}

/** True if anything lives under `prefix`. Stops at the first hit. */
async function hasAnyChild(
  op: InstanceType<typeof Operator>,
  prefix: string
): Promise<boolean> {
  const lister = await op.lister(prefix, { limit: 2, recursive: false });
  let entry;
  while ((entry = await lister.next()) !== null) {
    if (entry.path() === prefix) continue; // the directory itself is not a child
    return true;
  }
  return false;
}

/** The folder a key sits in, with its trailing slash; '' at the bucket root. */
function parentPrefix(key: string): string {
  const stripped = key.endsWith('/') ? key.slice(0, -1) : key;
  const cut = stripped.lastIndexOf('/');
  return cut === -1 ? '' : stripped.slice(0, cut + 1);
}

function resolveRename(path: string, newName: string): string {
  const invalid = validateObjectName(newName);
  if (invalid) throw new Error(invalid);
  return replaceLastSegment(path, newName.trim());
}

export async function renameFile(
  config: ConnectionConfig,
  path: string,
  newName: string
) {
  const toPath = resolveRename(path, newName);
  try {
    const op = getOperator(config);
    if (await op.exists(toPath)) {
      throw new Error(`An object named "${newName.trim()}" already exists.`);
    }
    await assertCanDelete(op, parentPrefix(path));
    await moveObject(op, path, toPath);
    return { success: true, path: toPath };
  } catch (error) {
    console.error('Rename File Error:', error);
    if (error instanceof Error && error.message === NO_DELETE_PERMISSION)
      throw error;
    if (isPermissionDenied(error))
      throw new Error('These credentials cannot rename this object.');
    throw error instanceof Error && error.message.startsWith('An object named')
      ? error
      : new Error('Failed to rename file.');
  }
}

/**
 * A directory rename is not one operation: every key under the old prefix is
 * copied to the matching key under the new one and then deleted, sequentially.
 * Cost scales with object count, not folder size, since the copies are
 * server-side.
 *
 * Sequential rather than Promise.all: a mid-walk failure leaves a legible
 * partial state instead of hundreds of concurrent calls landing in unknown
 * order. There is no progress UI and no cancel — same accepted tradeoff as the
 * full-bucket scan elsewhere in this file.
 */
export async function renameFolder(
  config: ConnectionConfig,
  path: string,
  newName: string
) {
  const fromPrefix = path.endsWith('/') ? path : `${path}/`;
  const toPath = resolveRename(fromPrefix, newName);
  const toPrefix = toPath.endsWith('/') ? toPath : `${toPath}/`;

  try {
    const op = getOperator(config);
    // exists() only sees an explicit directory marker, and most S3 folders are
    // implicit. Renaming onto one would merge the two and overwrite same-named
    // files with no warning, so probe for any child instead.
    if (await hasAnyChild(op, toPrefix)) {
      throw new Error(`A folder named "${newName.trim()}" already exists.`);
    }

    // Before the first copy: a half-renamed folder is bad, and one the user
    // cannot delete either is worse.
    await assertCanDelete(op, fromPrefix);

    const entries = await op.list(fromPrefix, { recursive: true });
    // An empty folder has nothing to move, so the new prefix needs a marker of
    // its own or the rename would look like a delete.
    await op.createDir(toPrefix);

    const markers: string[] = [fromPrefix];
    for (const entry of entries) {
      const key = entry.path();
      if (!key.startsWith(fromPrefix)) continue; // defensive, should always hold
      // Directory markers are zero-byte keys. The renamed children imply the
      // new prefixes, so collect the old markers and drop them at the end.
      if (key.endsWith('/')) {
        markers.push(key);
        continue;
      }
      await moveObject(op, key, toPrefix + key.slice(fromPrefix.length));
    }

    // Only the markers this walk saw. A blind removeAll(fromPrefix) here would
    // also wipe anything uploaded into the old folder while the rename ran.
    await op.remove(markers);
    return { success: true, path: toPrefix };
  } catch (error) {
    console.error('Rename Folder Error:', error);
    if (error instanceof Error && error.message === NO_DELETE_PERMISSION)
      throw error;
    throw error instanceof Error && error.message.startsWith('A folder named')
      ? error
      : new Error(
          'Failed to rename folder. Some files may have already moved — refresh to check the current state.'
        );
  }
}
