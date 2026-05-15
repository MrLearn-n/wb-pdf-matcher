import { Router } from 'express';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import unzipper from 'unzipper';
import { parseChzFilename } from '../services/chzParser.js';

import { upsertChzFile, upsertChzFilesBulk } from '../services/db.js';
import type { ImportResponse } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHZ_DIR = path.join(PROJECT_ROOT, 'data', 'wb_orders');

const upload = multer({ storage: multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, _file, cb) => cb(null, `chz-import-${Date.now()}.zip`),
}) });

// 6MB limit per chunk (chunks are ≤5MB + overhead)
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

const router = Router();

type Job =
  | { status: 'pending' }
  | { status: 'done'; imported: number; skipped: number }
  | { status: 'error'; error: string };

const jobs = new Map<string, Job>();

async function processZip(zipPath: string, jobId: string): Promise<void> {
  try {
    fs.mkdirSync(CHZ_DIR, { recursive: true });

    // Open ZIP via central directory — sequential, one file descriptor at a time
    const directory = await unzipper.Open.file(zipPath);
    const extractedPaths: string[] = [];

    for (const entry of directory.files) {
      const basename = path.basename(entry.path);
      if (entry.type !== 'File' || !basename.endsWith('.pdf') || basename.startsWith('._')) continue;
      const dest = path.join(CHZ_DIR, basename);
      await pipeline(entry.stream(), fs.createWriteStream(dest));
      extractedPaths.push(dest);
    }

    const entries = extractedPaths.flatMap((filePath) => {
      const basename = path.basename(filePath);
      const meta = parseChzFilename(basename);
      const totalPages = extractPageCount(basename);
      if (!meta || !totalPages) return [];
      return [{ filePath, ...meta, totalPages }];
    });

    const result = upsertChzFilesBulk(entries);
    jobs.set(jobId, { status: 'done', ...result });
  } catch (err) {
    jobs.set(jobId, { status: 'error', error: String(err) });
  } finally {
    fs.unlink(zipPath, () => {});
  }
}

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

// POST /api/import/zip/chunk  — upload one chunk; last chunk triggers processing
// Fields: chunk (file), jobId (string), chunkIndex (int), totalChunks (int)
router.post('/zip/chunk', chunkUpload.single('chunk'), (req, res) => {
  const { jobId, chunkIndex, totalChunks } = req.body as Record<string, string>;
  if (!req.file?.buffer || !jobId || chunkIndex === undefined || !totalChunks) {
    res.status(400).json({ error: 'Missing fields: chunk, jobId, chunkIndex, totalChunks' });
    return;
  }
  const idx = parseInt(chunkIndex, 10);
  const total = parseInt(totalChunks, 10);
  const tmpPath = path.join(os.tmpdir(), `chz-import-${jobId}.zip`);
  try {
    fs.appendFileSync(tmpPath, req.file.buffer);
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }
  if (idx === total - 1) {
    jobs.set(jobId, { status: 'pending' });
    res.json({ done: true, jobId });
    processZip(tmpPath, jobId);
  } else {
    res.json({ done: false, received: idx + 1 });
  }
});

// POST /api/import/zip  multipart: file=<zip>  — start async import, returns { jobId }
router.post('/zip', upload.single('file'), (req, res) => {
  if (!req.file?.path) {
    res.status(400).json({ error: 'No ZIP uploaded' });
    return;
  }
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'pending' });
  res.json({ jobId });
  processZip(req.file.path, jobId);
});

// GET /api/import/zip/status/:jobId  — poll for job result
router.get('/zip/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json(job);
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
