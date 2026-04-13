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
import { Readable, PassThrough } from 'node:stream';
import archiver from 'archiver';

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

    (async () => {
      try {
        if (listFiles) {
          for (const path of listFiles) {
            const meta = await op.stat(path);

            if (meta.isFile()) {
              const reader = await op.reader(path);

              const fileStream = new Readable({
                async read() {
                  try {
                    const buf = Buffer.alloc(64 * 1024);
                    const bytesRead = await reader.read(buf);

                    if (bytesRead > 0) {
                      this.push(buf.subarray(0, Number(bytesRead)));
                    } else {
                      this.push(null);
                    }
                  } catch (err) {
                    this.destroy(err as Error);
                  }
                },
              });

              archive.append(fileStream, { name: path });
            }
          }
        } else {
          const lister = await op.list(folderPath);

          for await (const entry of lister) {
            const path = entry.path();
            const meta = await op.stat(path);

            if (meta.isFile()) {
              const reader = await op.reader(path);

              // Create a Node.js Readable stream by manually pulling from OpenDAL
              const fileStream = new Readable({
                async read() {
                  try {
                    const buf = Buffer.alloc(64 * 1024);
                    const bytesRead = await reader.read(buf);

                    if (bytesRead > 0) {
                      this.push(buf.subarray(0, Number(bytesRead)));
                    } else {
                      this.push(null);
                    }
                  } catch (err) {
                    this.destroy(err as Error);
                  }
                },
              });

              archive.append(fileStream, { name: path });
            }
          }
        }

        await archive.finalize();
      } catch (err) {
        console.error('Worker Error:', err);
        archive.destroy(err as Error);
      }
    })();

    return new Response(passthrough as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="download.zip"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Download failed' }), {
      status: 500,
    });
  }
}
