import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';
import type { WbPageInfo } from '../types/index.js';
import { normalizeWbColor, normalizeSize } from './chzParser.js';

// Resolve worker relative to the pdfjs package itself — works regardless of cwd or bundling
const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
);

const PRODUCT_TYPES = ['Лонгслив', 'Футболка', 'Худи', 'Кофта', 'Свитшот', 'Джемпер'];

export async function parseWbPdf(pdfBytes: Uint8Array): Promise<WbPageInfo[]> {
  const doc = await pdfjs.getDocument({
    data: pdfBytes,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const results: WbPageInfo[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by Y coordinate (same line = same Y ± 1pt)
    const lineMap = new Map<number, string[]>();
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const bucket = findBucket(lineMap, y);
      lineMap.get(bucket)!.push(item.str.trim());
    }

    // Sort lines by Y descending (top → bottom in PDF coords)
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(' ').trim())
      .filter(Boolean);

    results.push(extractPageInfo(lines, i - 1));
  }

  return results;
}

function findBucket(map: Map<number, string[]>, y: number, tolerance = 2): number {
  for (const key of map.keys()) {
    if (Math.abs(key - y) <= tolerance) return key;
  }
  map.set(y, []);
  return y;
}

function extractPageInfo(lines: string[], pageIndex: number): WbPageInfo {
  let barcode = '';
  let productType = '';
  let color = '';
  let size = '';

  for (const line of lines) {
    if (!barcode && /^\d{10,14}$/.test(line)) {
      barcode = line;
      continue;
    }

    if (line.startsWith('Цвет:')) {
      color = normalizeWbColor(line.replace('Цвет:', '').trim());
      continue;
    }

    if (line.startsWith('Размер:')) {
      size = normalizeSize(line.replace('Размер:', '').trim());
      continue;
    }

    if (!productType) {
      for (const pt of PRODUCT_TYPES) {
        if (line.startsWith(pt)) {
          productType = pt;
          break;
        }
      }
    }
  }

  return { pageIndex, barcode, productType, color, size };
}
