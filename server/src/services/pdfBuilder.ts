import {
  PDFDocument, PDFFont, rgb,
  pushGraphicsState, popGraphicsState,
  moveTo, lineTo, closePath, clip, endPath,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { MatchResult } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const NOT_FOUND_PATH = path.join(PROJECT_ROOT, 'assets/not_found.pdf');
const FONT_REG_PATH  = path.join(PROJECT_ROOT, 'assets/fonts/LiberationSans-Regular.ttf');
const FONT_BOLD_PATH = path.join(PROJECT_ROOT, 'assets/fonts/LiberationSans-Bold.ttf');

const W = 58 * 2.8346; // ≈164.4pt
const H = 58 * 2.8346; // ≈164.4pt
const M = 4;

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxW) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function buildResultPdf(
  wbPdfBytes: Uint8Array,
  matches: MatchResult[],
): Promise<Uint8Array> {
  const outputDoc = await PDFDocument.create();
  outputDoc.registerFontkit(fontkit);

  const fontReg  = await outputDoc.embedFont(fs.readFileSync(FONT_REG_PATH));
  const fontBold = await outputDoc.embedFont(fs.readFileSync(FONT_BOLD_PATH));

  const wbDoc = await PDFDocument.load(wbPdfBytes);
  const notFoundDoc = await PDFDocument.load(fs.readFileSync(NOT_FOUND_PATH));
  const chzDocCache = new Map<string, PDFDocument>();

  async function getChzDoc(fp: string): Promise<PDFDocument> {
    if (!chzDocCache.has(fp)) chzDocCache.set(fp, await PDFDocument.load(fs.readFileSync(fp)));
    return chzDocCache.get(fp)!;
  }

  for (const { wb, chzFile, chzPageIndex } of matches) {
    const page = outputDoc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });

    const cw = W - 2 * M;

    function dt(text: string, x: number, yFromTop: number, size: number, bold = false, maxWidth = cw - (x - M)) {
      page.drawText(text, {
        x, y: H - yFromTop - size,
        size, font: bold ? fontBold : fontReg,
        color: rgb(0, 0, 0), maxWidth,
      });
    }

    let y = M;

    // 1. Product name
    const nameLines = wrapText(wb.productName || wb.productType || '', fontBold, 7, cw).slice(0, 2);
    for (const line of nameLines) { dt(line, M, y, 7, true); y += 8.5; }
    y += 1;

    // 2. Brand
    if (wb.brand) { dt(wb.brand, M, y, 6); y += 7.5; }
    y += 2;

    // 3. Full CHZ page — scaled to content width, no clipping
    let chzEmbedded: Awaited<ReturnType<PDFDocument['embedPdf']>>[0];
    if (chzFile && chzPageIndex !== null) {
      [chzEmbedded] = await outputDoc.embedPdf(await getChzDoc(chzFile.file_path), [chzPageIndex]);
    } else {
      [chzEmbedded] = await outputDoc.embedPdf(notFoundDoc, [0]);
    }
    const chzScale = W / chzEmbedded.width;
    const chzH = chzEmbedded.height * chzScale;
    page.drawPage(chzEmbedded, { x: 0, y: H - y - chzH, width: W, height: chzH });
    y += chzH + 3;

    // 4. Parameters
    const params: [string, string][] = [];
    if (wb.country) params.push(['Страна', wb.country]);
    if (wb.article) params.push(['Артикул', wb.article]);
    for (const [label, value] of params) { dt(`${label}: ${value}`, M, y, 5); y += 6.5; }

    // 5. Barcode — taken directly from the WB PDF page, clipped to the barcode XObject area.
    //    Preserves the original raster exactly as it was in the source file.
    const bb = wb.barcodeBounds;
    if (bb) {
      const DIGIT_FONT_SIZE = 5;
      const DIGIT_GAP = 2;       // gap between barcode bottom and digit text
      // Layout from page bottom: margin → digits → gap → barcode image
      const DIGIT_Y    = M;                                      // digit baseline
      const BARCODE_Y  = M + DIGIT_FONT_SIZE + DIGIT_GAP;       // barcode image bottom
      const BARCODE_ZONE_H = 22;

      // Scale uniformly to fit cw × BARCODE_ZONE_H
      const scale = Math.min(cw / bb.w, BARCODE_ZONE_H / bb.h);
      const dispW = bb.w * scale;
      const dispH = bb.h * scale;
      const zoneX = M + (cw - dispW) / 2;

      // Embed WB page and clip to barcode XObject area
      const [wbEmbedded] = await outputDoc.embedPdf(wbDoc, [wb.pageIndex]);
      const drawX = zoneX - bb.x * scale;
      const drawY = BARCODE_Y - bb.y * scale;

      page.pushOperators(
        pushGraphicsState(),
        moveTo(zoneX,         BARCODE_Y),
        lineTo(zoneX + dispW, BARCODE_Y),
        lineTo(zoneX + dispW, BARCODE_Y + dispH),
        lineTo(zoneX,         BARCODE_Y + dispH),
        closePath(), clip(), endPath(),
      );
      page.drawPage(wbEmbedded, {
        x: drawX, y: drawY,
        width:  wbEmbedded.width  * scale,
        height: wbEmbedded.height * scale,
      });
      page.pushOperators(popGraphicsState());

      // Digit string centred below the barcode image
      // EAN-13 format: "d dddddd dddddd"
      const bc = wb.barcode.slice(0, 13);
      const digitStr = `${bc[0]} ${bc.slice(1, 7)} ${bc.slice(7, 13)}`;
      const digitW = fontReg.widthOfTextAtSize(digitStr, DIGIT_FONT_SIZE);
      page.drawText(digitStr, {
        x: M + (cw - digitW) / 2,
        y: DIGIT_Y,
        size: DIGIT_FONT_SIZE,
        font: fontReg,
        color: rgb(0, 0, 0),
      });
    }
  }

  return outputDoc.save();
}
