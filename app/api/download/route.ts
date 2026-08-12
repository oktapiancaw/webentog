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
import { Readable } from 'node:stream';
import { getDb } from '@/lib/db';
import { readerToStream } from '../download-zip/stream';
import { isAuthenticated } from '@/app/actions/auth';

interface ConnectionRow {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

/** RFC 6266: ASCII fallback plus a UTF-8 form for everything else. */
function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Streams one object as an attachment. Shared by GET and POST.
 *
 * A presigned URL cannot do this: `presignRead` takes no options, so
 * `response-content-disposition` never gets signed, and browsers ignore the
 * `download` attribute cross-origin. The result was JSON opening in a tab.
 */
async function streamAttachment(conn: ConnectionRow, path: string) {
  const op = getOperator(conn);

  const meta = await op.stat(path);
  if (!meta.isFile()) {
    return new Response(JSON.stringify({ error: 'Not a file' }), {
      status: 400,
    });
  }

  const reader = await op.reader(path);
  const name = path.split('/').filter(Boolean).pop() || 'download';

  const headers = new Headers({
    // octet-stream so nothing renders inline if a proxy strips the header below.
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(name),
  });
  if (meta.contentLength !== null) {
    headers.set('Content-Length', String(meta.contentLength));
  }

  return new Response(
    Readable.toWeb(readerToStream(reader)) as ReadableStream,
    {
      headers,
    }
  );
}

/**
 * Non-persistent mode: connections live in sessionStorage, so there is no row to
 * resolve and the client posts the config. Credentials ride in the body, not the
 * query string, keeping them out of URLs and logs. The client reads the response
 * as a blob, so this path buffers in memory where GET streams.
 */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  try {
    const { config, path } = await req.json();
    if (!config || !path) {
      return new Response(JSON.stringify({ error: 'Missing config or path' }), {
        status: 400,
      });
    }
    return await streamAttachment(config as ConnectionRow, path as string);
  } catch (error) {
    console.error('Download Error:', error);
    return new Response(JSON.stringify({ error: 'Download failed' }), {
      status: 500,
    });
  }
}

/**
 * Persistent mode: takes a connection id, not credentials, so nothing secret
 * lands in a URL or a log. Resolves the row server-side and streams through.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const connId = searchParams.get('conn');
  const path = searchParams.get('path');

  if (!connId || !path) {
    return new Response(JSON.stringify({ error: 'Missing conn or path' }), {
      status: 400,
    });
  }

  // proxy.ts skips /api, and this route resolves credentials by id. Without the
  // check, anyone reaching the server could walk ?conn=N&path=... and read any
  // object from any saved connection. True when PERSISTENT_CONNECTION=false.
  if (!(await isAuthenticated())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  try {
    const conn = getDb()
      .prepare('SELECT * FROM connections WHERE id = ?')
      .get(Number(connId)) as ConnectionRow | undefined;

    if (!conn) {
      return new Response(JSON.stringify({ error: 'Unknown connection' }), {
        status: 404,
      });
    }

    return await streamAttachment(conn, path);
  } catch (error) {
    console.error('Download Error:', error);
    return new Response(JSON.stringify({ error: 'Download failed' }), {
      status: 500,
    });
  }
}
