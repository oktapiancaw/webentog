import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), './data/connections.db');
const db = new Database(dbPath);

// Create the connections table if it doesn't exist
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

export default db;
