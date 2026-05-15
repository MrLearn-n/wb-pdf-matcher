import { findAvailableChz, claimChzPage } from './db.js';
import type { WbPageInfo, MatchResult } from '../types/index.js';

export function matchPages(wbPages: WbPageInfo[]): MatchResult[] {
  return wbPages.map((wb) => {
    if (!wb.productType || !wb.color || !wb.size) {
      return { wb, chzFile: null, chzPageIndex: null };
    }

    const chzFile = findAvailableChz(wb.productType, wb.subtype, wb.qualifiers, wb.color, wb.size);
    if (!chzFile) {
      return { wb, chzFile: null, chzPageIndex: null };
    }

    const chzPageIndex = claimChzPage(chzFile.id);
    return { wb, chzFile, chzPageIndex };
  });
}
