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
import type { Operator, Reader } from 'opendal';
import type { Archiver } from 'archiver';
import { Readable } from 'node:stream';

const CHUNK_SIZE = 64 * 1024;

/**
 * Adapts an OpenDAL `Reader` to a Node `Readable` by pulling fixed-size chunks.
 * The Node binding exposes only `read(buf)`, so archiver gets no native stream
 * and the pull loop has to be written by hand.
 */
export function readerToStream(reader: Reader): Readable {
  return new Readable({
    async read() {
      try {
        const buf = Buffer.alloc(CHUNK_SIZE);
        const bytesRead = await reader.read(buf);

        if (bytesRead > 0) this.push(buf.subarray(0, Number(bytesRead)));
        else this.push(null);
      } catch (err) {
        // destroy() reaches archiver's own 'error' handler. Do not swallow it.
        this.destroy(err as Error);
      }
    },
  });
}

/**
 * Appends one object to the archive. Directories are skipped: a key can be a
 * prefix rather than a real object, and `reader()` would fail on those.
 */
export async function appendPathToArchive(
  op: Operator,
  archive: Archiver,
  path: string
) {
  const meta = await op.stat(path);
  if (!meta.isFile()) return;

  const reader = await op.reader(path);
  archive.append(readerToStream(reader), { name: path });
}
