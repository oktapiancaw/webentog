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

import { FileType } from '@/components/app-browser';
import { Operator } from 'opendal';
import db from '@/lib/db';
import fs from 'node:fs';
import archiver from 'archiver';
import path from 'node:path';

export interface ConnectionConfig {
  id?: number;
  name?: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export async function saveConnection(config: ConnectionConfig) {
  try {
    const { name, endpoint, accessKey, secretKey, bucket, region } = config;
    const stmt = db.prepare(`
      INSERT INTO connections (name, endpoint, accessKey, secretKey, bucket, region)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name || 'Unnamed Connection',
      endpoint,
      accessKey,
      secretKey,
      bucket,
      region
    );
    return { id: result.lastInsertRowid };
  } catch (error) {
    console.error('Save Connection Error:', error);
    throw new Error('Failed to save connection.');
  }
}

export async function getConnections(): Promise<ConnectionConfig[]> {
  try {
    const stmt = db.prepare(
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
    const stmt = db.prepare('DELETE FROM connections WHERE id = ?');
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
  const op = new Operator('s3', {
    endpoint: config.endpoint,
    access_key_id: config.accessKey,
    secret_access_key: config.secretKey,
    bucket: config.bucket,
    region: config.region,
    allow_http: 'true',
  });

  const files = formData.getAll('files') as File[];
  if (!files.length) throw new Error('No files provided');

  const results = [];
  const folderPath_ = folderPath.endsWith('/') ? folderPath : folderPath + '/';

  for (const file of files) {
    // 10MB limit check
    if (file.size > 10 * 1024 * 1024)
      throw new Error(`${file.name} is too large`);

    const buffer = Buffer.from(await file.arrayBuffer());
    // Using a cleaner path structure
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
export async function listStorageFiles(config: ConnectionConfig, path: string) {
  try {
    const op = new Operator('s3', {
      endpoint: config.endpoint,
      access_key_id: config.accessKey,
      secret_access_key: config.secretKey,
      bucket: config.bucket,
      region: config.region,
      allow_http: 'true',
    });
    const entries = await op.list(path);

    const formattedFiles = [];
    for (const entry of entries) {
      const pathString = entry.path();
      if (pathString === path) {
        continue;
      }
      let fileType: FileType = 'unknown';
      const metadata = entry.metadata();
      const isFolder = metadata.isDirectory();
      if (isFolder) {
        fileType = 'folder';
      } else {
        const pathArray = pathString.split('.');

        if (pathArray.length > 1) {
          const extension = pathArray[pathArray.length - 1].toLowerCase();

          switch (extension) {
            // Image types
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'svg':
            case 'webp':
              fileType = 'image';
              break;

            // Document types
            case 'pdf':
              fileType = 'pdf';
              break;

            // Data types
            case 'json':
              fileType = 'json';
              break;

            // Video types
            case 'mp4':
            case 'mkv':
            case 'avi':
            case 'mov':
            case 'webm':
              fileType = 'video';
              break;

            // Anything else stays "unknown"
            default:
              fileType = 'unknown';
          }
        }
      }
      const sizeFile = metadata.contentLength
        ? Math.round(Number(metadata.contentLength) / 1024) + 'KB'
        : '--';
      const name = pathString.split('/').filter(Boolean).pop() || 'unknown';
      formattedFiles.push({
        id: pathString,
        name: name,
        type: fileType,
        size: sizeFile,
        lastModified: metadata.lastModified,
      });
    }

    return formattedFiles;
  } catch (error) {
    console.error('OpenDAL Error:', error);
    throw new Error('Failed to connect or list files.');
  }
}

export async function getDownloadUrl(config: ConnectionConfig, path: string) {
  try {
    const op = new Operator('s3', {
      endpoint: config.endpoint,
      access_key_id: config.accessKey,
      secret_access_key: config.secretKey,
      bucket: config.bucket,
      region: config.region,
    });

    const req = await op.presignRead(path, 3600);

    return req.url;
  } catch (error) {
    console.error('Presign URL Error:', error);
    throw new Error('Failed to generate download link.');
  }
}
export async function downloadFolderAsZip(
  config: ConnectionConfig,
  remotePath: string
) {
  const op = new Operator('s3', {
    endpoint: config.endpoint,
    access_key_id: config.accessKey,
    secret_access_key: config.secretKey,
    bucket: config.bucket,
    region: config.region,
  });

  const zipFileName = `download-${Date.now()}.zip`;
  const localOutputPath = path.resolve('./downloads', zipFileName);

  // Ensure download directory exists
  if (!fs.existsSync(path.dirname(localOutputPath))) {
    fs.mkdirSync(path.dirname(localOutputPath), { recursive: true });
  }

  const output = fs.createWriteStream(localOutputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    // Listen for all archive data to be written
    output.on('close', () =>
      resolve({ path: localOutputPath, size: archive.pointer() })
    );
    archive.on('error', (err) => reject(err));

    // Pipe archive data to the file
    archive.pipe(output);

    (async () => {
      try {
        const lister = await op.list(remotePath);

        for await (const entry of lister) {
          const meta = await op.stat(entry.path());

          if (meta.isFile()) {
            // Get a reader stream from OpenDAL
            const reader = await op.reader(entry.path());
            const nodeStream = reader.createReadStream();

            // Append the stream to the zip
            // We use entry.path() as the name inside the zip
            archive.append(nodeStream, { name: entry.path() });
          }
        }

        // Finalize the ZIP (this tells the archiver we are done adding files)
        await archive.finalize();
      } catch (err) {
        archive.destroy(err as Error);
        reject(err);
      }
    })();
  });
}
