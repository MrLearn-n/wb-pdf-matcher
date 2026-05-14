import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import matchRouter from './routes/match.js';
import importRouter from './routes/importChz.js';
import statsRouter from './routes/stats.js';

// rootDir:"src" → dist/index.js in prod, src/index.ts in dev → 2 levels up = project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CLIENT_DIST = path.join(PROJECT_ROOT, 'client/dist');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());
// Large limit for ZIP upload (up to 500MB)
app.use(express.urlencoded({ extended: false }));

app.use('/api/match', matchRouter);
app.use('/api/import', importRouter);
app.use('/api/stats', statsRouter);

app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.download(filePath);
});

// Serve React build in production
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
