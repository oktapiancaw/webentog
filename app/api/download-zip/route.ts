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

    // Background process
    (async () => {
      try {
        if (listFiles) {
          for (const path of listFiles) {
            const meta = await op.stat(path);

            if (meta.isFile()) {
              const reader = await op.reader(path);

              // Create a Node.js Readable stream by manually pulling from OpenDAL
              const fileStream = new Readable({
                async read() {
                  try {
                    // Allocate a 64KB buffer for the next chunk
                    const buf = Buffer.alloc(64 * 1024);
                    // OpenDAL fills the buffer and returns how many bytes were actually read
                    const bytesRead = await reader.read(buf);

                    if (bytesRead > 0) {
                      // Push only the portion of the buffer that was filled
                      this.push(buf.subarray(0, Number(bytesRead)));
                    } else {
                      // bytesRead is 0, meaning End of File
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
                    // Allocate a 64KB buffer for the next chunk
                    const buf = Buffer.alloc(64 * 1024);
                    // OpenDAL fills the buffer and returns how many bytes were actually read
                    const bytesRead = await reader.read(buf);

                    if (bytesRead > 0) {
                      // Push only the portion of the buffer that was filled
                      this.push(buf.subarray(0, Number(bytesRead)));
                    } else {
                      // bytesRead is 0, meaning End of File
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
