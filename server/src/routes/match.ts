import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseWbPdf } from '../services/wbParser.js';
import { matchPages } from '../services/matcher.js';
import { buildResultPdf } from '../services/pdfBuilder.js';
import type { MatchResponse } from '../types/index.js';

// routes/ → ../../.. = project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Keep files in memory — avoids temp-file encoding issues
const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post('/', upload.single('pdf'), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ error: 'No PDF uploaded' });
    return;
  }

  try {
    const rawBuffer = req.file.buffer;

    // pdfjs may transfer/neuter the array — give each consumer its own copy
    const wbPages = await parseWbPdf(new Uint8Array(rawBuffer));
    const matches = matchPages(wbPages);

    const resultBytes = await buildResultPdf(new Uint8Array(rawBuffer), matches);

    const outputName = `result_${Date.now()}.pdf`;
    const outputPath = path.join(OUTPUT_DIR, outputName);
    fs.writeFileSync(outputPath, resultBytes);

    const matched = matches.filter((m) => m.chzFile !== null).length;
    const notFound = matches.length - matched;

    res.json({
      total: matches.length,
      matched,
      notFound,
      downloadUrl: `/api/download/${outputName}`,
    } satisfies MatchResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
