import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { ChzFile, StatsResponse } from '../types/index.js';

// With tsc rootDir:"src" → dist/services/ in prod, src/services/ in dev
// Both need 3 levels up to reach project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DB_PATH = path.join(PROJECT_ROOT, 'data/chz.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    init(_db);
  }
  return _db;
}

function init(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chz_files (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path    TEXT    NOT NULL UNIQUE,
      product_type TEXT    NOT NULL,
      color        TEXT    NOT NULL,
      size         TEXT    NOT NULL,
      ean          TEXT    NOT NULL DEFAULT '',
      total_pages  INTEGER NOT NULL,
      next_page    INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function upsertChzFile(
  filePath: string,
  productType: string,
  color: string,
  size: string,
  ean: string,
  totalPages: number,
): 'inserted' | 'skipped' {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM chz_files WHERE file_path = ?').get(filePath);
  if (existing) return 'skipped';
  db.prepare(`
    INSERT INTO chz_files (file_path, product_type, color, size, ean, total_pages)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(filePath, productType, color, size, ean, totalPages);
  return 'inserted';
}

export function findAvailableChz(
  productType: string,
  color: string,
  size: string,
): ChzFile | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM chz_files
    WHERE product_type = ? AND color = ? AND size = ? AND next_page < total_pages
    ORDER BY id
    LIMIT 1
  `).get(productType, color, size) as ChzFile | undefined;
  return row ?? null;
}

export function claimChzPage(id: number): number {
  const db = getDb();
  const row = db.prepare('SELECT next_page FROM chz_files WHERE id = ?').get(id) as { next_page: number };
  const pageIndex = row.next_page;
  db.prepare('UPDATE chz_files SET next_page = next_page + 1 WHERE id = ?').run(id);
  return pageIndex;
}

export function getStats(): StatsResponse {
  const db = getDb();
  const files = db.prepare('SELECT * FROM chz_files').all() as ChzFile[];

  let totalCodes = 0;
  let usedCodes = 0;
  const byProduct: Record<string, { total: number; used: number }> = {};

  for (const f of files) {
    totalCodes += f.total_pages;
    usedCodes += f.next_page;
    const pt = f.product_type;
    if (!byProduct[pt]) byProduct[pt] = { total: 0, used: 0 };
    byProduct[pt].total += f.total_pages;
    byProduct[pt].used += f.next_page;
  }

  return {
    totalFiles: files.length,
    totalCodes,
    usedCodes,
    availableCodes: totalCodes - usedCodes,
    byProduct,
  };
}

export function resetAll(): void {
  const db = getDb();
  db.prepare('UPDATE chz_files SET next_page = 0').run();
}
