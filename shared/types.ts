export interface WbPageInfo {
  pageIndex: number;
  barcode: string;
  productType: string;
  color: string;
  size: string;
}

export interface ChzFile {
  id: number;
  file_path: string;
  product_type: string;
  color: string;
  size: string;
  ean: string;
  total_pages: number;
  next_page: number;
}

export interface MatchResult {
  wb: WbPageInfo;
  chzFile: ChzFile | null;
  chzPageIndex: number | null;
}

export interface MatchResponse {
  total: number;
  matched: number;
  notFound: number;
  downloadUrl: string;
}

export interface StatsResponse {
  totalFiles: number;
  totalCodes: number;
  usedCodes: number;
  availableCodes: number;
  byProduct: Record<string, { total: number; used: number }>;
}

export interface ImportResponse {
  imported: number;
  skipped: number;
}
