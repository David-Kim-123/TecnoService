import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const schemaPath = join(root, 'src', 'db', 'schema.sql');
const defaultPath = join(root, 'data', 'tecnoservice.sqlite');

export function abrirBaseDatos(ruta = defaultPath) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta, { timeout: 3000 });
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 3000;');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return db;
}
