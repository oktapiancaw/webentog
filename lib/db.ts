import Database from 'better-sqlite3';
import path from 'path';

let instance: Database.Database | null = null;

/**
 * Opens the SQLite database on first use.
 *
 * Lazy on purpose: with PERSISTENT_CONNECTION=false nothing should touch disk,
 * and opening at module import would both create ./data/connections.db and
 * crash the whole app with SQLITE_CANTOPEN when ./data is not mounted.
 */
export function getDb(): Database.Database {
  if (instance) return instance;

  const db = new Database(path.join(process.cwd(), './data/connections.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      accessKey TEXT NOT NULL,
      secretKey TEXT NOT NULL,
      bucket TEXT NOT NULL,
      region TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Folder bookmarks, scoped to a connection. UNIQUE because double-pinning the
  // same folder has no meaning — unlike `connections`, where "same bucket under
  // a different name" is legitimate and so carries no uniqueness constraint.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pinned_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(connection_id, path)
    )
  `);

  instance = db;
  return instance;
}
