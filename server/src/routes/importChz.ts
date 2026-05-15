import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import unzipper from 'unzipper';
import { parseChzFilename } from '../services/chzParser.js';

import { upsertChzFile } from '../services/db.js';
import type { ImportResponse } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHZ_DIR = path.join(PROJECT_ROOT, 'data', 'wb_orders');

const upload = multer({ storage: multer.memoryStorage() });
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
  if (!req.file?.buffer) {
    res.status(400).json({ error: 'No ZIP uploaded' });
    return;
  }

  fs.mkdirSync(CHZ_DIR, { recursive: true });

  try {
    // Unzip into CHZ_DIR
    const directory = await unzipper.Open.buffer(req.file.buffer);
    for (const entry of directory.files) {
      if (entry.type !== 'File') continue;
      const basename = path.basename(entry.path);
      if (!basename.endsWith('.pdf') || basename.startsWith('._')) continue;
      const dest = path.join(CHZ_DIR, basename);
      const content = await entry.buffer();
      fs.writeFileSync(dest, content);
    }

    res.json(importFromDir(CHZ_DIR));
  } catch (err) {
    res.status(500).json({ error: String(err) });
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
