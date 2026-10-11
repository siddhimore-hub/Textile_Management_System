import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.resolve(here, '../../data/mill.db');
for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
await import('./db.js');
console.log('Database reset.');
