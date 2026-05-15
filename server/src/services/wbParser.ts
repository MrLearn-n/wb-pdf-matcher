import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';
import type { WbPageInfo } from '../types/index.js';
import { normalizeWbColor, normalizeSize, KNOWN_SUBTYPES, extractQualifiers } from './chzParser.js';

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

    // Detect barcode image XObject position via operator list
    const ops = await page.getOperatorList();
    let mat = [1, 0, 0, 1, 0, 0];
    const stk: number[][] = [];
    let barcodeBounds: import('../types/index.js').BarcodeBounds | null = null;
    for (let j = 0; j < ops.fnArray.length; j++) {
      const fn = ops.fnArray[j];
      const args = ops.argsArray[j];
      if (fn === pdfjs.OPS.save) stk.push([...mat]);
      else if (fn === pdfjs.OPS.restore) mat = stk.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === pdfjs.OPS.transform) {
        const [a, b, c, d, e, f] = args as number[];
        mat = [
          mat[0] * a + mat[2] * b, mat[1] * a + mat[3] * b,
          mat[0] * c + mat[2] * d, mat[1] * c + mat[3] * d,
          mat[0] * e + mat[2] * f + mat[4], mat[1] * e + mat[3] * f + mat[5],
        ];
      } else if (fn === pdfjs.OPS.paintImageXObject && !barcodeBounds) {
        barcodeBounds = { x: mat[4], y: mat[5], w: Math.abs(mat[0]), h: Math.abs(mat[3]) };
      }
    }

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

    results.push(extractPageInfo(lines, i - 1, barcodeBounds));
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

function extractPageInfo(
  lines: string[],
  pageIndex: number,
  barcodeBounds: import('../types/index.js').BarcodeBounds | null,
): WbPageInfo {
  let barcode = '';
  let productType = '';
  let subtype = '';
  let qualifiers = '';
  let color = '';
  let size = '';
  let brand = '';
  let article = '';
  let country = '';
  const productNameLines: string[] = [];

  for (const line of lines) {
    if (!barcode && /^\d{10,14}$/.test(line)) {
      barcode = line;
      continue;
    }

    if (line.startsWith('Цвет:')) {
      const parts = line.split(' / ');
      color = normalizeWbColor(parts[0].replace('Цвет:', '').trim());
      for (const part of parts) {
        if (part.includes('Разм.:') && !size) {
          size = normalizeSize(part.replace(/Разм\.:/, '').trim());
        }
      }
      continue;
    }

    if (line.startsWith('Размер:')) {
      size = normalizeSize(line.replace('Размер:', '').trim());
      continue;
    }

    if (line.startsWith('Бренд:')) {
      brand = line.replace('Бренд:', '').trim();
      continue;
    }

    if (line.startsWith('Артикул:')) {
      article = line.replace('Артикул:', '').trim();
      continue;
    }

    if (line.startsWith('Страна')) {
      country = line.replace(/^Страна[^:]*:\s*/, '').trim();
      continue;
    }

    if (!productType) {
      for (const pt of PRODUCT_TYPES) {
        if (line.includes(pt)) {
          productType = pt;
          const words = line.split(/\s+/);
          const ptIdx = words.findIndex((w) => w === pt);
          const before = ptIdx > 0 ? words[ptIdx - 1].toLowerCase() : '';
          const after = ptIdx >= 0 && ptIdx + 1 < words.length ? words[ptIdx + 1].toLowerCase() : '';
          if (KNOWN_SUBTYPES.includes(before)) subtype = before;
          else if (KNOWN_SUBTYPES.includes(after)) subtype = after;
          productNameLines.push(line);
          break;
        }
      }
    } else if (!color && !size) {
      productNameLines.push(line);
    }
  }

  qualifiers = extractQualifiers(productNameLines.join(' '));
  const productName = productNameLines.join(' ').trim();

  return { pageIndex, barcode, productType, subtype, qualifiers, color, size, productName, brand, article, country, barcodeBounds };
}
