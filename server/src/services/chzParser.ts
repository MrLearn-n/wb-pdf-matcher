import path from 'path';

const KNOWN_SIZES = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl'];
export const KNOWN_SUBTYPES = ['оверсайз', 'мужской', 'женский', "базовый"];
// Phrases that appear symmetrically in both WB names and CZ filenames
export const KNOWN_QUALIFIERS = ['с начесом', 'без начеса', 'с принтом'];

// Longest first so "2xl" matches before "xl"
const SIZE_REGEX = new RegExp(`\\b(${[...KNOWN_SIZES].reverse().join('|')})\\b`, 'i');

const COLOR_VARIANTS: Record<string, string> = {
  'белый': 'белый', 'белая': 'белый',
  'черный': 'черный', 'черная': 'черный',
  'голубой': 'голубой', 'голубая': 'голубой',
  'розовый': 'розовый', 'розовая': 'розовый',
  'серый': 'серый', 'серая': 'серый',
  'красный': 'красный', 'красная': 'красный',
  'бежевый': 'бежевый', 'бежевая': 'бежевый',
  'хаки': 'хаки',
  'графит': 'графит',
  'темно серый': 'темно серый',
  'темно-серый': 'темно серый',
};

export interface ChzFileMeta {
  productType: string;
  subtype: string;
  qualifiers: string;
  color: string;
  size: string;
  ean: string;
}

export function extractQualifiers(text: string): string {
  const lower = text.toLowerCase();
  return KNOWN_QUALIFIERS.filter((q) => lower.includes(q)).sort().join(',');
}

export function parseChzFilename(filename: string): ChzFileMeta | null {
  const base = path.basename(filename, '.pdf');

  // Extract EAN — 13-14 digits surrounded by underscores
  const eanMatch = base.match(/_(\d{13,14})_/) ?? base.match(/_(\d{13,14})$/);
  const ean = eanMatch?.[1] ?? '';

  // Normalize to NFC (filesystem may use NFD), then flatten
  const flat = base.normalize('NFC').replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase();
  const segments = base.normalize('NFC').split('_');

  // Product type: first underscore-separated word
  const productType = segments[0];

  // Subtype: second segment if it matches a known subtype keyword
  const secondSeg = (segments[1] ?? '').toLowerCase();
  const subtype = KNOWN_SUBTYPES.includes(secondSeg) ? secondSeg : '';

  // Qualifiers: known multi-word phrases anywhere in the flat name
  const qualifiers = extractQualifiers(flat);

  // Size: search in flat text
  const sizeMatch = flat.match(SIZE_REGEX);
  const size = sizeMatch?.[1].toLowerCase() ?? '';

  // Color: check compound colors first, then single-word
  let color = '';
  for (const [variant, normalized] of Object.entries(COLOR_VARIANTS)) {
    if (flat.includes(variant)) {
      color = normalized;
      // Prefer longer matches (compound colors)
      if (variant.includes(' ') || variant.includes('-')) break;
    }
  }

  if (!size || !color) return null;

  return { productType, subtype, qualifiers, color, size, ean };
}

export function normalizeWbColor(raw: string): string {
  const lower = raw.toLowerCase().trim();
  // Handle compound colors like "серый меланж"
  for (const [variant, normalized] of Object.entries(COLOR_VARIANTS)) {
    if (lower === variant || lower.startsWith(variant)) return normalized;
  }
  // Fallback: return as-is lowercased
  return lower;
}

export function normalizeSize(raw: string): string {
  return raw.toLowerCase().trim();
}
