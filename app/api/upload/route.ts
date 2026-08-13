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
import { getOperator } from '@/lib/opendal';
import { isAuthenticated } from '@/app/actions/auth';
import {
  MAX_UPLOAD_FILE_BYTES,
  buildUploadPath,
  tooBigMessage,
} from '@/lib/upload';
import { explainError } from '@/lib/utils';
import type { ConnectionConfig } from '@/app/actions/object-management';

/**
 * Transport for one file, replacing the old `uploadFiles` server action.
 *
 * A Server Action's request body is capped by Next's default
 * `bodySizeLimit` (1MB) — well under what this feature's own numbers need
 * (up to 100MB total) — and offers no upload-progress hook at all (no
 * `XMLHttpRequest.upload.onprogress` equivalent over the RSC action-encoding
 * wire). An ordinary route accepts whatever body size the deployment allows
 * and lets the client drive a real `XMLHttpRequest` for progress.
 *
 * One file per request — not the whole batch in one `FormData` — is what
 * makes independent per-file progress bars possible instead of a single
 * aggregate number.
 */
export async function POST(req: Request) {
  // proxy.ts already gates non-public paths, but this route resolves and uses
  // credentials it is handed directly, so it checks again itself — same
  // belt-and-suspenders as the download route.
  if (!(await isAuthenticated())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const configJson = formData.get('config');
    const folderPath = String(formData.get('folderPath') ?? '/');
    const regenerateName = formData.get('regenerateName') !== 'false';

    if (!(file instanceof File) || typeof configJson !== 'string') {
      return Response.json(
        { error: 'Missing file or config' },
        { status: 400 }
      );
    }

    // The batch rule (file count, total size) can only be checked by whoever
    // orchestrates the loop, but the per-file cap belongs here: this route is
    // reachable without the UI, so without it an authenticated caller could
    // stream an unbounded body through the server.
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      return Response.json(
        { error: tooBigMessage(file.name) },
        { status: 413 }
      );
    }

    const config: ConnectionConfig = JSON.parse(configJson);
    const op = getOperator(config);
    const path = buildUploadPath(folderPath, file.name, regenerateName);

    const writer = await op.writer(path);
    // Streamed in chunks rather than buffering the whole file into memory a
    // second time on top of whatever the platform already holds for the
    // request body.
    //
    // Deliberately no close() on the failure path: close() is the *commit*,
    // not a cleanup — for a multipart write it is what completes the upload.
    // Calling it after a failed chunk would ask the backend to finalize a
    // truncated object at the destination key, which with "Regenerate name"
    // unchecked would overwrite a good object with a partial one. The Node
    // binding exposes no abort(), so the safe move is to let the writer drop
    // uncommitted.
    for await (const chunk of file.stream() as unknown as AsyncIterable<Uint8Array>) {
      await writer.write(Buffer.from(chunk));
    }
    await writer.close();

    return Response.json({ path });
  } catch (error) {
    console.error('Upload Error:', error);
    return Response.json(
      { error: explainError(error, 'Upload failed.').message },
      { status: 500 }
    );
  }
}
