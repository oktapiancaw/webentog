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
import { Operator } from 'opendal';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import { appendPathToArchive } from './stream';

export async function POST(req: Request) {
  try {
    const { config, folderPath, listFiles } = await req.json();

    const op = new Operator('s3', {
      endpoint: config.endpoint,
      access_key_id: config.accessKey,
      secret_access_key: config.secretKey,
      bucket: config.bucket,
      region: config.region,
    });

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
        // Explicit selection wins; otherwise zip everything under the folder.
        const paths: string[] = listFiles ?? [];
        if (!listFiles) {
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
