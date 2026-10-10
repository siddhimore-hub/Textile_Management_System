// Single shared SQLite connection. Every module imports { db } from here.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.resolve(here, '../../data/mill.db');
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const root = path.resolve(here, '../../../db');
const hasTables = db.prepare("SELECT name FROM sqlite_master WHERE name='orders'").get();
if (!hasTables) {
  db.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(root, 'seed.sql'), 'utf8'));
  console.log('Database created and seeded at', file);
}
