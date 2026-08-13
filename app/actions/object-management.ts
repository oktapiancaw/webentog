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
import { getDb, insertAndGetId } from '@/lib/db';
import type { UserRole } from '@/lib/db/types';
import { getCurrentUser } from './auth';
import { attempt, type ActionResult } from '@/lib/action-result';
import {
  basename,
  classifyVersionListFailure,
  cursorAfterKey,
  fileTypeFromName,
  explainError,
  folderPrefix,
  formatStorage,
  isPermissionDenied,
  joinFolder,
  parentPrefix,
  replaceLastSegment,
  validateObjectName,
  type FileType,
} from '@/lib/utils';

/**
 * Keeps the real cause instead of flattening every storage failure into the
 * same sentence. A denied credential and an unreachable endpoint need
 * different things from the user, and the client only ever sees this message —
 * React strips server error text from production bundles.
 */
function storageError(error: unknown, fallback: string): Error {
  return new Error(explainError(error, fallback).message);
}

export interface ConnectionConfig {
  id?: number;
  name?: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  /** Set by the server on read; ignored on write, where the actor owns it. */
  owner_id?: number | null;
  /** Joined for the admin view so connections can be labelled by owner. */
  owner_username?: string | null;
}

/**
 * Insert, or update when `config` carries an id.
 *
 * The id branch is the whole point: without it every edit inserted a second
 * row. `connections` has no unique key other than the primary one, so there is
 * nothing for an `ON CONFLICT` upsert to match on — this has to be an explicit
 * branch.
 */
export async function saveConnection(
  config: ConnectionConfig
): Promise<ActionResult<{ id: number | bigint }>> {
  return attempt(
    'Save Connection Error',
    'Could not save that connection.',
    async () => {
      const actor = await requireUser();
      const { id, name, endpoint, accessKey, secretKey, bucket, region } =
        config;
      const { db, type } = await getDb();
      const values = {
        name: name || 'Unnamed Connection',
        endpoint,
        accessKey,
        secretKey,
        bucket,
        region,
      };

      if (id) {
        // Editing somebody else's connection is refused outright rather than
        // silently updating nothing: a bare id is easy to guess, and this row
        // holds bucket credentials.
        await assertMayAdminister(id, actor);
        const result = await db
          .updateTable('connections')
          .set(values)
          .where('id', '=', id)
          .executeTakeFirst();
        // Falling back to an INSERT here would answer "this row is gone" by
        // quietly making a new one under a different id, which is the duplicate
        // bug again wearing a different hat.
        if (Number(result.numUpdatedRows) === 0) {
          throw new Error(
            'This connection no longer exists. It may have been deleted in another tab.'
          );
        }
        return { id };
      }

      return {
        id: await insertAndGetId(
          db
            .insertInto('connections')
            .values({ ...values, owner_id: actor.userId }),
          type
        ),
      };
    }
  );
}

/**
 * The signed-in user, or a thrown error.
 *
 * Identity is read from the session cookie inside each action, never accepted
 * as a parameter — a server action is an HTTP endpoint, so a caller-supplied
 * role is a role the caller picked.
 *
 * In non-persistent mode there is no users table and no server-side identity,
 * so ownership does not apply; `NO_OWNERSHIP` stands in and every row is
 * reachable, exactly as before this feature existed.
 */
const NO_OWNERSHIP = { userId: 0, role: 'admin' as const };

async function requireUser(): Promise<{ userId: number; role: UserRole }> {
  if (process.env.PERSISTENT_CONNECTION === 'false') return NO_OWNERSHIP;
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in.');
  return { userId: user.userId, role: user.role };
}

/** Owner or admin. Grantees can use a connection but not edit or delete it. */
async function assertMayAdminister(
  connectionId: number,
  actor: { userId: number; role: UserRole }
): Promise<void> {
  if (actor.role === 'admin') return;
  const { db } = await getDb();
  const row = await db
    .selectFrom('connections')
    .select('owner_id')
    .where('id', '=', connectionId)
    .executeTakeFirst();
  if (!row) throw new Error('This connection no longer exists.');
  if (row.owner_id !== actor.userId) {
    throw new Error('This connection belongs to someone else.');
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
      error: explainError(error, 'Could not connect with these settings.')
        .message,
    };
  }
}

/**
 * The connections the signed-in user may see.
 *
 * These rows carry secret keys, so the filter is the security boundary: an
 * admin gets everything (with the owner's name, so duplicates across users are
 * spottable), and everyone else gets what they own plus what they have been
 * granted — never a directory of other people's connections.
 */
export async function getConnections(): Promise<ConnectionConfig[]> {
  try {
    const actor = await requireUser();
    const { db } = await getDb();

    let query = db
      .selectFrom('connections')
      .leftJoin('users', 'users.id', 'connections.owner_id')
      .select([
        'connections.id as id',
        'connections.name as name',
        'connections.endpoint as endpoint',
        'connections.accessKey as accessKey',
        'connections.secretKey as secretKey',
        'connections.bucket as bucket',
        'connections.region as region',
        'connections.owner_id as owner_id',
        'users.username as owner_username',
      ])
      .orderBy('connections.created_at', 'desc');

    if (actor.role !== 'admin') {
      query = query.where((eb) =>
        eb.or([
          eb('connections.owner_id', '=', actor.userId),
          eb.exists(
            eb
              .selectFrom('connection_grants')
              .select('connection_grants.id')
              .whereRef(
                'connection_grants.connection_id',
                '=',
                'connections.id'
              )
              .where('connection_grants.user_id', '=', actor.userId)
          ),
        ])
      );
    }

    return await query.execute();
  } catch (error) {
    // Read paths degrade quietly here, as they do elsewhere in this file. An
    // empty sidebar is the safe direction to fail: it shows too little rather
    // than too much.
    console.error('Get Connections Error:', error);
    return [];
  }
}

export async function deleteConnection(
  id: number
): Promise<ActionResult<true>> {
  return attempt(
    'Delete Connection Error',
    'Could not delete that connection.',
    async () => {
      const actor = await requireUser();
      await assertMayAdminister(id, actor);
      const { db } = await getDb();
      // No foreign keys in this schema, so grants and pins are cleaned up here.
      await db
        .deleteFrom('connection_grants')
        .where('connection_id', '=', id)
        .execute();
      await db
        .deleteFrom('pinned_folders')
        .where('connection_id', '=', id)
        .execute();
      await db.deleteFrom('connections').where('id', '=', id).execute();
      return true as const;
    }
  );
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
    throw storageError(error, 'Could not list this folder.');
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
    throw storageError(error, 'Could not count this folder.');
  }
}

export async function getDownloadUrl(config: ConnectionConfig, path: string) {
  try {
    const op = getOperator(config);

    const req = await op.presignRead(path, 3600);

    return req.url;
  } catch (error) {
    console.error('Presign URL Error:', error);
    throw storageError(error, 'Could not generate a download link.');
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
    throw storageError(error, 'Could not read this object.');
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
    throw storageError(error, 'Could not list versions of this object.');
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
    throw storageError(error, 'Could not restore that version.');
  }
}

/**
 * Above this, a version is not previewed inline.
 *
 * The bytes come back through the action payload as base64, which inflates
 * them by a third and buffers the whole object in memory on both ends. That is
 * an acceptable trade for looking at a photo and a bad one for a 200MB video,
 * so there is a line.
 */
const MAX_VERSION_PREVIEW_BYTES = 8 * 1024 * 1024;

/**
 * One old version of an object, as a data URL.
 *
 * A presigned URL would be the obvious transport and cannot be used:
 * `presignRead(path, expires)` takes no options, so there is nowhere to put a
 * version id, and appending `?versionId=` to a signed URL invalidates the
 * signature. The bytes have to come through the server, which already holds
 * the credentials.
 */
export async function getVersionPreview(
  config: ConnectionConfig,
  path: string,
  versionId: string
): Promise<ActionResult<{ dataUrl: string }>> {
  return attempt(
    'Version Preview Error',
    'Could not load that version.',
    async () => {
      const op = getOperator(config);

      // Checked before the read, not after: the point is to avoid pulling the
      // object into memory at all when it is too big to show.
      const meta = await op.stat(path, { version: versionId });
      const size =
        meta.contentLength !== null ? Number(meta.contentLength) : null;
      if (size !== null && size > MAX_VERSION_PREVIEW_BYTES) {
        throw new Error(
          `That version is ${formatStorage(size)}, too large to preview here. Use "Save as" and open the copy.`
        );
      }

      const bytes = await op.read(path, { version: versionId });
      const type = meta.contentType || 'application/octet-stream';
      return {
        dataUrl: `data:${type};base64,${Buffer.from(bytes).toString('base64')}`,
      };
    }
  );
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
      : storageError(error, 'Could not save that version as a new object.');
  }
}

export async function deleteFile(
  config: ConnectionConfig,
  path: string
): Promise<ActionResult<true>> {
  return attempt(
    'Delete File Error',
    'Could not delete that file.',
    async () => {
      const op = getOperator(config);
      try {
        await op.delete(path);
      } catch (error) {
        if (isPermissionDenied(error)) {
          throw new Error('These credentials cannot delete objects.');
        }
        throw error;
      }
      return true as const;
    }
  );
}

export async function createFolder(
  config: ConnectionConfig,
  path: string
): Promise<ActionResult<true>> {
  return attempt(
    'Create Folder Error',
    'Could not create that folder.',
    async () => {
      const op = getOperator(config);
      await op.createDir(path);
      return true as const;
    }
  );
}

/**
 * Deletes a folder and everything under it.
 *
 * `delete` is single-key, so a folder needs `removeAll`. The trailing slash is
 * enforced because `removeAll('a/b')` would also match a sibling key `a/bc`.
 */
export async function deleteFolder(
  config: ConnectionConfig,
  path: string
): Promise<ActionResult<true>> {
  return attempt(
    'Delete Folder Error',
    'Could not delete that folder.',
    async () => {
      const op = getOperator(config);
      try {
        await op.removeAll(path.endsWith('/') ? path : `${path}/`);
      } catch (error) {
        if (isPermissionDenied(error)) {
          throw new Error('These credentials cannot delete objects.');
        }
        throw error;
      }
      return true as const;
    }
  );
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

/**
 * Reproduces every key under `fromPrefix` at `toPrefix`, removing the
 * originals when `remove` is set.
 *
 * A directory operation is not one call: S3 has no recursive copy, so each key
 * is visited individually. Cost scales with object count, not folder size,
 * since the copies are server-side.
 *
 * Sequential rather than Promise.all: a mid-walk failure leaves a legible
 * partial state instead of hundreds of concurrent calls landing in unknown
 * order. There is no progress UI and no cancel — same accepted tradeoff as the
 * full-bucket scan elsewhere in this file.
 *
 * Rename, copy-into and move-into all reduce to this, differing only in
 * `remove` and in where `toPrefix` points.
 */
async function transferTree(
  op: InstanceType<typeof Operator>,
  fromPrefix: string,
  toPrefix: string,
  remove: boolean
) {
  const entries = await op.list(fromPrefix, { recursive: true });
  // An empty folder has no children to imply the new prefix, so it needs a
  // marker of its own or the operation would look like a delete.
  await op.createDir(toPrefix);

  const markers: string[] = [fromPrefix];
  for (const entry of entries) {
    const key = entry.path();
    if (!key.startsWith(fromPrefix)) continue; // defensive, should always hold
    if (key === fromPrefix) continue; // the folder itself, already handled
    const target = toPrefix + key.slice(fromPrefix.length);
    // Directory markers are zero-byte keys. Children imply their own prefixes,
    // but an *empty* subfolder has none — so recreate the marker rather than
    // letting the subfolder vanish, and collect the old one to drop at the end.
    if (key.endsWith('/')) {
      markers.push(key);
      await op.createDir(target);
      continue;
    }
    if (remove) await moveObject(op, key, target);
    else await op.copy(key, target);
  }

  // Only the markers this walk saw. A blind removeAll(fromPrefix) here would
  // also wipe anything uploaded into the old folder while the walk ran.
  if (remove) await op.remove(markers);
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

function resolveRename(path: string, newName: string): string {
  const invalid = validateObjectName(newName);
  if (invalid) throw new Error(invalid);
  return replaceLastSegment(path, newName.trim());
}

export async function renameFile(
  config: ConnectionConfig,
  path: string,
  newName: string
): Promise<ActionResult<{ path: string }>> {
  return attempt(
    'Rename File Error',
    'Could not rename that file.',
    async () => {
      const toPath = resolveRename(path, newName);
      const op = getOperator(config);
      if (await op.exists(toPath)) {
        throw new Error(`An object named "${newName.trim()}" already exists.`);
      }
      await assertCanDelete(op, parentPrefix(path));
      try {
        await moveObject(op, path, toPath);
      } catch (error) {
        if (isPermissionDenied(error)) {
          throw new Error('These credentials cannot rename this object.');
        }
        throw error;
      }
      return { path: toPath };
    }
  );
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
): Promise<ActionResult<{ path: string }>> {
  return attempt(
    'Rename Folder Error',
    // A mid-walk failure is possible, so the generic case says so rather than
    // implying nothing happened.
    'Failed to rename folder. Some files may have already moved — refresh to check the current state.',
    async () => {
      const fromPrefix = path.endsWith('/') ? path : `${path}/`;
      const toPath = resolveRename(fromPrefix, newName);
      const toPrefix = toPath.endsWith('/') ? toPath : `${toPath}/`;

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

      await transferTree(op, fromPrefix, toPrefix, true);
      return { path: toPrefix };
    }
  );
}

/**
 * Puts one file into `destFolder` under the same name.
 *
 * Copy and move share a body because they differ by exactly one delete: S3 has
 * no move, so a move is the same server-side CopyObject followed by removing
 * the original — the shape `moveObject` already implements for rename.
 */
async function transferFile(
  op: InstanceType<typeof Operator>,
  sourcePath: string,
  destFolder: string,
  remove: boolean
): Promise<string> {
  const name = basename(sourcePath);
  const destPath = joinFolder(destFolder, name);

  // Landing on itself is a same-key copy, which overwrites the source with the
  // source — harmless but pointless for a move, and destructive-looking enough
  // for a copy to be worth refusing rather than silently doing nothing.
  if (destPath === sourcePath) {
    throw new Error(`"${name}" is already in that folder.`);
  }
  if (await op.exists(destPath)) {
    throw new Error(`"${name}" already exists in that folder.`);
  }

  if (!remove) {
    await op.copy(sourcePath, destPath);
    return destPath;
  }

  // Before the first copy: a moved file that could not be cleaned up at the
  // source is a duplicate the same credentials cannot remove either.
  await assertCanDelete(op, parentPrefix(sourcePath));
  await moveObject(op, sourcePath, destPath);
  return destPath;
}

/** Same, for a folder and everything under it. */
async function transferFolder(
  op: InstanceType<typeof Operator>,
  sourcePath: string,
  destFolder: string,
  remove: boolean
): Promise<string> {
  const name = basename(sourcePath);
  const fromPrefix = folderPrefix(sourcePath);
  const toPrefix = folderPrefix(joinFolder(destFolder, name));

  if (toPrefix === fromPrefix) {
    throw new Error(`"${name}" is already in that folder.`);
  }
  // A destination under the source is a walk that keeps generating its own
  // input. The picker greys these out, but a server action is reachable
  // without it, so this is the check that counts.
  if (toPrefix.startsWith(fromPrefix)) {
    throw new Error(
      `Cannot ${remove ? 'move' : 'copy'} a folder into itself or one of its own subfolders.`
    );
  }
  // exists() only sees an explicit directory marker, and most S3 folders are
  // implicit. Landing on one would merge the two and overwrite same-named files
  // with no warning, so probe for any child instead.
  if (await hasAnyChild(op, toPrefix)) {
    throw new Error(`"${name}" already exists in that folder.`);
  }

  if (remove) await assertCanDelete(op, fromPrefix);
  await transferTree(op, fromPrefix, toPrefix, remove);
  return toPrefix;
}

/**
 * Copy / move take `destFolder` and derive the key, never a caller-supplied
 * destination path — the same reason rename takes a name and not a path. The
 * name always comes from the source, so neither can turn into a rename.
 *
 * One pair of actions rather than the four the plan sketched
 * (copyFile/moveFile/copyFolder/moveFolder): the four bodies differed only in
 * `remove` and in which helper ran, which the client already has to decide
 * either way.
 */
export async function copyObjectTo(
  config: ConnectionConfig,
  sourcePath: string,
  destFolder: string,
  isFolder: boolean
): Promise<ActionResult<{ path: string }>> {
  return attempt(
    'Copy Object Error',
    isFolder
      ? 'Could not copy that folder. Some files may have already been copied — refresh to check the current state.'
      : 'Could not copy that file.',
    async () => {
      const op = getOperator(config);
      return {
        path: isFolder
          ? await transferFolder(op, sourcePath, destFolder, false)
          : await transferFile(op, sourcePath, destFolder, false),
      };
    }
  );
}

export async function moveObjectTo(
  config: ConnectionConfig,
  sourcePath: string,
  destFolder: string,
  isFolder: boolean
): Promise<ActionResult<{ path: string }>> {
  return attempt(
    'Move Object Error',
    // A mid-walk failure is possible, so the generic case says so rather than
    // implying nothing happened.
    isFolder
      ? 'Could not move that folder. Some files may have already moved — refresh to check the current state.'
      : 'Could not move that file.',
    async () => {
      const op = getOperator(config);
      return {
        path: isFolder
          ? await transferFolder(op, sourcePath, destFolder, true)
          : await transferFile(op, sourcePath, destFolder, true),
      };
    }
  );
}
