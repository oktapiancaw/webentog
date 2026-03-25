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

    const formattedFiles = entries.map((entry) => {
      const pathString = entry.path();
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
      return {
        id: pathString,
        name: name,
        type: fileType,
        size: sizeFile,
        lastModified: metadata.lastModified,
      };
    });

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
