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
'use client';

import { getPersistentMode } from '@/app/actions/auth';
import { unwrap } from '@/lib/action-result';
import {
  getConnections,
  saveConnection,
  deleteConnection,
  type ConnectionConfig,
} from '@/app/actions/object-management';
import {
  getPinnedFolders,
  pinFolder,
  unpinFolder,
  unpinFoldersUnder,
  validateFolderPaths,
  type PinnedFolder,
  type ValidatedPinnedFolder,
} from '@/app/actions/pinned-folders';
import {
  reorderConnections as reorderConnectionsAction,
  toggleConnectionPin as toggleConnectionPinAction,
} from '@/app/actions/connection-prefs';
import { MAX_PINNED_CONNECTIONS } from '@/lib/utils';

/**
 * Storage backend selector for connections and pins.
 *
 * PERSISTENT_CONNECTION=true  -> SQLite, via server actions.
 * PERSISTENT_CONNECTION=false -> browser sessionStorage; nothing touches disk
 *                                and everything is gone when the tab closes.
 *
 * Everything else in the app is unaffected: every other server action already
 * receives the full `ConnectionConfig` from the client, so only list/save/
 * delete need a backend at all.
 */

const CONNECTIONS_KEY = 'webentog:connections';
const PINS_KEY = 'webentog:pins';

/** One round trip per page load; the value cannot change without a redeploy. */
let modePromise: Promise<boolean> | null = null;
export function isPersistentStorage(): Promise<boolean> {
  return (modePromise ??= getPersistentMode());
}

function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return []; // corrupt entry behaves as empty rather than breaking the sidebar
  }
}

function write<T>(key: string, rows: T[]) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(key, JSON.stringify(rows));
}

const nextId = (rows: { id?: number }[]) =>
  rows.reduce((max, row) => Math.max(max, row.id ?? 0), 0) + 1;

export async function loadConnections(): Promise<ConnectionConfig[]> {
  if (await isPersistentStorage()) return getConnections();
  // The server sorts pinned-first in SQL; here the stored array order *is* the
  // order, so only the pinned group has to be lifted out in front of it.
  const rows = read<ConnectionConfig>(CONNECTIONS_KEY);
  return [...rows.filter((r) => r.pinned), ...rows.filter((r) => !r.pinned)];
}

/**
 * Records a new order for one group of connections.
 *
 * `orderedIds` covers one group only (pinned or unpinned), so the untouched
 * group keeps its positions. In sessionStorage mode the array is the order, so
 * the listed ids are written back in place — the slots they already occupy.
 */
export async function reorderConnections(orderedIds: number[]): Promise<void> {
  if (await isPersistentStorage()) {
    unwrap(await reorderConnectionsAction(orderedIds));
    return;
  }

  const rows = read<ConnectionConfig>(CONNECTIONS_KEY);
  const moving = new Set(orderedIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const reordered = orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is ConnectionConfig => Boolean(row));

  // Rebuild in place: walk the original array and, at each slot belonging to
  // the moved group, drop in the next member of the new order. Rows outside
  // the group never shift.
  let next = 0;
  write(
    CONNECTIONS_KEY,
    rows.map((row) =>
      row.id !== undefined && moving.has(row.id) ? reordered[next++] : row
    )
  );
}

export async function toggleConnectionPin(
  id: number,
  pinned: boolean
): Promise<void> {
  if (await isPersistentStorage()) {
    unwrap(await toggleConnectionPinAction(id, pinned));
    return;
  }

  const rows = read<ConnectionConfig>(CONNECTIONS_KEY);
  // Same limit and same refusal as the server: never silently evict a pin the
  // user chose.
  if (
    pinned &&
    rows.filter((r) => r.pinned && r.id !== id).length >= MAX_PINNED_CONNECTIONS
  ) {
    throw new Error(
      `You can only pin up to ${MAX_PINNED_CONNECTIONS} connections. Unpin one first.`
    );
  }
  write(
    CONNECTIONS_KEY,
    rows.map((row) => (row.id === id ? { ...row, pinned } : row))
  );
}

export async function storeConnection(
  config: ConnectionConfig
): Promise<{ id: number }> {
  if (await isPersistentStorage()) {
    const { id } = unwrap(await saveConnection(config));
    return { id: Number(id) };
  }

  const rows = read<ConnectionConfig>(CONNECTIONS_KEY);
  // Editing replaces in place; only a new entry gets an id.
  if (config.id) {
    const index = rows.findIndex((row) => row.id === config.id);
    if (index >= 0) {
      // `pinned` comes from the sidebar, not the edit form, so carry it over
      // rather than letting a save silently unpin the connection.
      rows[index] = { ...config, pinned: rows[index].pinned };
      write(CONNECTIONS_KEY, rows);
      return { id: config.id };
    }
  }

  const id = nextId(rows);
  write(CONNECTIONS_KEY, [...rows, { ...config, id }]);
  return { id };
}

export async function removeConnection(id: number): Promise<void> {
  if (await isPersistentStorage()) {
    unwrap(await deleteConnection(id));
    return;
  }

  write(
    CONNECTIONS_KEY,
    read<ConnectionConfig>(CONNECTIONS_KEY).filter((row) => row.id !== id)
  );
  // No foreign key in sessionStorage, so cascade by hand.
  write(
    PINS_KEY,
    read<PinnedFolder>(PINS_KEY).filter((pin) => pin.connection_id !== id)
  );
}

export async function loadPins(
  config: ConnectionConfig
): Promise<ValidatedPinnedFolder[]> {
  if (await isPersistentStorage()) return getPinnedFolders(config);
  if (!config.id) return [];

  const rows = read<PinnedFolder>(PINS_KEY).filter(
    (pin) => pin.connection_id === config.id
  );
  if (rows.length === 0) return [];

  // Existence is a storage question, so it still goes to the server.
  const flags = await validateFolderPaths(
    config,
    rows.map((row) => row.path)
  );
  return rows.map((row, i) => ({ ...row, exists: flags[i] }));
}

export async function addPin(
  connectionId: number,
  path: string
): Promise<{ id: number }> {
  if (await isPersistentStorage())
    return unwrap(await pinFolder(connectionId, path));

  const rows = read<PinnedFolder>(PINS_KEY);
  // Mirrors the table's UNIQUE(connection_id, path): re-pinning is a no-op.
  const existing = rows.find(
    (pin) => pin.connection_id === connectionId && pin.path === path
  );
  if (existing) return { id: existing.id };

  const id = nextId(rows);
  write(PINS_KEY, [
    ...rows,
    {
      id,
      connection_id: connectionId,
      path,
      created_at: new Date().toISOString(),
    },
  ]);
  return { id };
}

/**
 * Triggers a browser download that actually saves rather than navigating.
 *
 * Persistent mode passes a connection id so the server resolves credentials and
 * streams. Non-persistent mode has no server-side row, so the config is POSTed
 * and the response becomes a blob — which buffers the whole object in memory,
 * the unavoidable cost of keeping credentials out of the URL.
 */
export async function downloadObject(config: ConnectionConfig, key: string) {
  if ((await isPersistentStorage()) && config.id) {
    triggerDownload(
      `/api/download?conn=${config.id}&path=${encodeURIComponent(key)}`
    );
    return;
  }

  const response = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, path: key }),
  });
  if (!response.ok) throw new Error('Download failed');

  const url = URL.createObjectURL(await response.blob());
  try {
    triggerDownload(url, key.split('/').filter(Boolean).pop());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerDownload(href: string, fileName?: string) {
  const link = document.createElement('a');
  link.href = href;
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Drops the pin for a deleted folder and any pin nested under it. Returns the
 * removed paths.
 *
 * Non-persistent mode has no foreign keys, so it cascades by hand — the same
 * thing `removeConnection` does for its pins.
 */
export async function removePinsUnder(
  connectionId: number,
  path: string
): Promise<string[]> {
  if (await isPersistentStorage()) return unpinFoldersUnder(connectionId, path);

  const prefix = path.endsWith('/') ? path : `${path}/`;
  const rows = read<PinnedFolder>(PINS_KEY);
  const doomed = rows.filter(
    (pin) =>
      pin.connection_id === connectionId &&
      (pin.path === path || pin.path.startsWith(prefix))
  );
  if (doomed.length === 0) return [];

  const gone = new Set(doomed.map((pin) => pin.id));
  write(
    PINS_KEY,
    rows.filter((pin) => !gone.has(pin.id))
  );
  return doomed.map((pin) => pin.path);
}

export async function removePin(id: number): Promise<void> {
  if (await isPersistentStorage()) {
    unwrap(await unpinFolder(id));
    return;
  }
  write(
    PINS_KEY,
    read<PinnedFolder>(PINS_KEY).filter((pin) => pin.id !== id)
  );
}
