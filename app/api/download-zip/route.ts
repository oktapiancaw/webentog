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
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import { appendPathToArchive } from './stream';
import { isAuthenticated } from '@/app/actions/auth';

/** One checked row. Folders are prefixes and have to be expanded to real keys. */
interface SelectionItem {
  path: string;
  type: 'file' | 'folder';
}

/**
 * Turns a mixed selection of files and folders into a flat list of object keys.
 *
 * A folder cannot be handed straight to `appendPathToArchive`, which is why
 * `listFiles` is a files-only contract. It stats the key first, so a folder
 * with an explicit marker is skipped and the zip comes back quietly missing it,
 * and an implicit prefix — most S3 folders — makes the stat throw NotFound and
 * takes the whole archive down. Expanding to real keys here is what makes a
 * mixed selection zippable at all.
 */
async function expandSelection(
  op: ReturnType<typeof getOperator>,
  selection: SelectionItem[]
): Promise<string[]> {
  const paths: string[] = [];
  for (const item of selection) {
    if (item.type !== 'folder') {
      paths.push(item.path);
      continue;
    }
    const prefix = item.path.endsWith('/') ? item.path : `${item.path}/`;
    for (const entry of await op.list(prefix, { recursive: true })) {
      const key = entry.path();
      if (key.endsWith('/')) continue; // directory marker, no bytes to add
      paths.push(key);
    }
  }
  return paths;
}

export async function POST(req: Request) {
  // The other two routes that take credentials in a body already gate on this;
  // this one did not.
  if (!(await isAuthenticated())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  try {
    const { config, folderPath, listFiles, selection } = await req.json();

    const op = getOperator(config);

    const passthrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('error', (err) => {
      console.error('Archive Error:', err);
      passthrough.destroy(err);
    });

    archive.pipe(passthrough);

    // Not awaited: the archive streams into the response while it is built.
    (async () => {
      try {
        // Most specific request wins: a checked selection, then an explicit
        // file list, then the whole folder.
        let paths: string[];
        if (Array.isArray(selection)) {
          paths = await expandSelection(op, selection as SelectionItem[]);
        } else if (listFiles) {
          paths = listFiles as string[];
        } else {
          paths = [];
          for await (const entry of await op.list(folderPath)) {
            paths.push(entry.path());
          }
        }

        for (const path of paths) {
          await appendPathToArchive(op, archive, path);
        }

        await archive.finalize();
      } catch (err) {
        console.error('Worker Error:', err);
        archive.destroy(err as Error);
      }
    })();

    return new Response(Readable.toWeb(passthrough) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="download.zip"`,
      },
    });
  } catch (error) {
    console.error('Download Zip Error:', error);
    return new Response(JSON.stringify({ error: 'Download failed' }), {
      status: 500,
    });
  }
}
