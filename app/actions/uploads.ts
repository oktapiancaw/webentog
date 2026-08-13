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

import { getOperator } from '@/lib/opendal';
import { attempt, type ActionResult } from '@/lib/action-result';
import { buildUploadPath, validateUploadBatch } from '@/lib/upload';
import type { ConnectionConfig } from './object-management';

/**
 * The count-and-total gate for a whole batch, called once before the
 * per-file loop starts.
 *
 * Upload is one HTTP request per file (what makes real per-file progress
 * possible), so by the time a 6th file or the file that tips the total over
 * 100MB is reached, everything before it has already succeeded — this has to
 * run up front, against the batch as a whole, or it can't run at all.
 */
export async function checkUploadBudget(
  files: { size: number }[]
): Promise<ActionResult<true>> {
  return attempt('Upload Budget Error', 'Could not start the upload.', () => {
    const invalid = validateUploadBatch(files);
    if (invalid) throw new Error(invalid);
    return Promise.resolve(true as const);
  });
}

export interface UploadUrl {
  url: string;
  method: string;
  headers: Record<string, string>;
  path: string;
}

/**
 * A presigned PUT for one large file — the browser writes bytes straight to
 * the bucket, none of them pass through this server. Same precedent as
 * `getDownloadUrl`'s `presignRead`, mirrored for the write side.
 *
 * Same overwrite semantics as the streamed route: `regenerateName: false`
 * PUTs to the plain key and overwrites whatever is already there.
 */
export async function getUploadUrl(
  config: ConnectionConfig,
  folderPath: string,
  fileName: string,
  regenerateName: boolean
): Promise<ActionResult<UploadUrl>> {
  return attempt(
    'Get Upload URL Error',
    'Could not prepare that upload.',
    async () => {
      const op = getOperator(config);
      const path = buildUploadPath(folderPath, fileName, regenerateName);
      const req = await op.presignWrite(path, 3600); // same 1h expiry as presignRead
      return { url: req.url, method: req.method, headers: req.headers, path };
    }
  );
}
