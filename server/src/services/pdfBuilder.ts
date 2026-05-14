import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { MatchResult } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const NOT_FOUND_PATH = path.join(PROJECT_ROOT, 'assets/not_found.pdf');

export async function buildResultPdf(
  wbPdfBytes: Uint8Array,
  matches: MatchResult[],
): Promise<Uint8Array> {
  const wbDoc = await PDFDocument.load(wbPdfBytes);
  const outputDoc = await PDFDocument.create();
  const notFoundBytes = fs.readFileSync(NOT_FOUND_PATH);
  const notFoundDoc = await PDFDocument.load(notFoundBytes);

  const chzDocCache = new Map<string, PDFDocument>();

  async function getChzDoc(filePath: string): Promise<PDFDocument> {
    if (chzDocCache.has(filePath)) return chzDocCache.get(filePath)!;
    const bytes = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(bytes);
    chzDocCache.set(filePath, doc);
    return doc;
  }

  for (const { wb, chzFile, chzPageIndex } of matches) {
    const wbSrcPage = wbDoc.getPage(wb.pageIndex);
    const wbW = wbSrcPage.getWidth();
    const wbH = wbSrcPage.getHeight();

    let chzW: number;
    let chzH: number;
    let chzEmbedded: Awaited<ReturnType<PDFDocument['embedPdf']>>[0];

    if (chzFile && chzPageIndex !== null) {
      const chzDoc = await getChzDoc(chzFile.file_path);
      const chzSrcPage = chzDoc.getPage(chzPageIndex);
      chzW = chzSrcPage.getWidth();
      chzH = chzSrcPage.getHeight();
      [chzEmbedded] = await outputDoc.embedPdf(chzDoc, [chzPageIndex]);
    } else {
      const nfPage = notFoundDoc.getPage(0);
      chzW = nfPage.getWidth();
      chzH = nfPage.getHeight();
      [chzEmbedded] = await outputDoc.embedPdf(notFoundDoc, [0]);
    }

    const [wbEmbedded] = await outputDoc.embedPdf(wbDoc, [wb.pageIndex]);

    const pageW = wbW + chzW;
    const pageH = Math.max(wbH, chzH);

    const newPage = outputDoc.addPage([pageW, pageH]);

    const wbOffsetY = (pageH - wbH) / 2;
    newPage.drawPage(wbEmbedded, { x: 0, y: wbOffsetY, width: wbW, height: wbH });

    const chzOffsetY = (pageH - chzH) / 2;
    newPage.drawPage(chzEmbedded, { x: wbW, y: chzOffsetY, width: chzW, height: chzH });
  }

  return outputDoc.save();
}
