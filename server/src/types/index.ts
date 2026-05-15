export interface BarcodeBounds {
  x: number; y: number; w: number; h: number; // in WB page points
}

export interface WbPageInfo {
  pageIndex: number;
  barcode: string;
  productType: string;
  subtype: string;
  qualifiers: string;
  color: string;
  size: string;
  productName: string;
  brand: string;
  article: string;
  country: string;
  barcodeBounds: BarcodeBounds | null;
}

export interface ChzFile {
  id: number;
  file_path: string;
  product_type: string;
  subtype: string;
  qualifiers: string;
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
