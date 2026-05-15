import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import multer from 'multer';
import unzipper from 'unzipper';
import { parseChzFilename } from '../services/chzParser.js';

import { upsertChzFile, upsertChzFilesBulk } from '../services/db.js';
import type { ImportResponse } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHZ_DIR = path.join(PROJECT_ROOT, 'data', 'wb_orders');

// Save uploaded ZIP to a temp file on disk — avoids buffering the whole archive in RAM
const upload = multer({ storage: multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, _file, cb) => cb(null, `chz-import-${Date.now()}.zip`),
}) });
const router = Router();

function extractPageCount(filename: string): number | null {
  const match = filename.match(/[_-](\d+)шт/);
  return match ? parseInt(match[1], 10) : null;
}

function importFromDir(dir: string): ImportResponse {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf') && !f.startsWith('._'));
  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const meta = parseChzFilename(file);
    if (!meta) { skipped++; continue; }

    const totalPages = extractPageCount(file);
    if (!totalPages) { skipped++; continue; }

    const result = upsertChzFile(
      path.join(dir, file),
      meta.productType,
      meta.subtype,
      meta.qualifiers,
      meta.color,
      meta.size,
      meta.ean,
      totalPages,
    );
    if (result === 'inserted') imported++;
    else skipped++;
  }

  return { imported, skipped };
}

// POST /api/import/dir  { dir: "/absolute/path" }  — local folder
router.post('/dir', (req, res) => {
  const dir: string | undefined = req.body?.dir;
  if (!dir || !fs.existsSync(dir)) {
    res.status(400).json({ error: 'dir not found' });
    return;
  }
  res.json(importFromDir(dir));
});

// POST /api/import/zip  multipart: file=<zip>  — upload ZIP archive
router.post('/zip', upload.single('file'), async (req, res) => {
  if (!req.file?.path) {
    res.status(400).json({ error: 'No ZIP uploaded' });
    return;
  }

  const zipPath = req.file.path;
  fs.mkdirSync(CHZ_DIR, { recursive: true });

  // Fail fast with a clear error instead of letting Railway kill the connection with 502
  const TIMEOUT_MS = 240_000;
  const timeoutHandle = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ error: 'Import timed out — ZIP is too large or disk is slow' });
  }, TIMEOUT_MS);

  try {
    const extractedPaths: string[] = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: unzipper.Entry) => {
          const basename = path.basename(entry.path);
          if (entry.type !== 'File' || !basename.endsWith('.pdf') || basename.startsWith('._')) {
            entry.autodrain();
            return;
          }
          const dest = path.join(CHZ_DIR, basename);
          extractedPaths.push(dest);
          entry.pipe(fs.createWriteStream(dest))
            .on('error', reject);
        })
        .on('finish', resolve)
        .on('error', reject);
    });

    // Only process newly extracted files — bulk insert in one transaction
    const entries = [];
    for (const filePath of extractedPaths) {
      const basename = path.basename(filePath);
      const meta = parseChzFilename(basename);
      if (!meta) continue;
      const totalPages = extractPageCount(basename);
      if (!totalPages) continue;
      entries.push({ filePath, ...meta, totalPages });
    }

    if (!res.headersSent) res.json(upsertChzFilesBulk(entries));
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  } finally {
    clearTimeout(timeoutHandle);
    fs.unlink(zipPath, () => {});
  }
});

// POST /api/import  { dir } — backward compat
router.post('/', (req, res) => {
  const dir: string | undefined = req.body?.dir;
  if (!dir || !fs.existsSync(dir)) {
    res.status(400).json({ error: 'dir not found' });
    return;
  }
  res.json(importFromDir(dir));
});

export default router;
