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
  validateFolderPaths,
  type PinnedFolder,
  type ValidatedPinnedFolder,
} from '@/app/actions/pinned-folders';

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
  return read<ConnectionConfig>(CONNECTIONS_KEY);
}

export async function storeConnection(
  config: ConnectionConfig
): Promise<{ id: number }> {
  if (await isPersistentStorage()) {
    const { id } = await saveConnection(config);
    return { id: Number(id) };
  }

  const rows = read<ConnectionConfig>(CONNECTIONS_KEY);
  // Editing replaces in place; only a new entry gets an id.
  if (config.id) {
    const index = rows.findIndex((row) => row.id === config.id);
    if (index >= 0) {
      rows[index] = config;
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
    await deleteConnection(id);
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
  if (await isPersistentStorage()) return pinFolder(connectionId, path);

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

export async function removePin(id: number): Promise<void> {
  if (await isPersistentStorage()) {
    await unpinFolder(id);
    return;
  }
  write(
    PINS_KEY,
    read<PinnedFolder>(PINS_KEY).filter((pin) => pin.id !== id)
  );
}
