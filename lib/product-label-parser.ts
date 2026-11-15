export type ProductImageView = 'front' | 'back' | 'side';
export type ProductOcrLine = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
export type ProductOcrImage = { id: number; view: ProductImageView; filename: string; lines: ProductOcrLine[] };
export type DeclarationEvidence = { imageId: number; view: ProductImageView; filename: string; excerpt: string; confidence: number; bbox: ProductOcrLine['bbox'] };
export type ProductDeclaration = { value: string | null; confidence: number; status: 'detected' | 'not_detected'; imageEvidence: DeclarationEvidence[] };
export type ProductLabelOcrResult = {
  engine: string;
  scanReference: string;
  processedAt: string;
  sourceImageCount: number;
  declarations: {
    manufacturerPackerImporterDetails: ProductDeclaration;
    countryOfOrigin: ProductDeclaration;
    genericFoodName: ProductDeclaration;
    netQuantity: ProductDeclaration;
    manufacturingMonthYear: ProductDeclaration;
    bestBeforeUseBy: ProductDeclaration;
    mrp: ProductDeclaration;
    unitSalePrice: ProductDeclaration;
    consumerCareDetails: ProductDeclaration;
    declarationVisibility: { value: 'visible' | 'partially_visible' | 'not_detected'; confidence: number; note: string; imageEvidence: DeclarationEvidence[] };
  };
};

type LocatedLine = ProductOcrLine & { image: Omit<ProductOcrImage, 'lines'> };
type Extracted = { value: string; lines: LocatedLine[] };

function clean(value: string) { return value.replace(/^[\s:;|–—-]+|[\s|]+$/g, '').replace(/\s+/g, ' ').trim(); }
function confidence(lines: LocatedLine[]) {
  if (!lines.length) return 0;
  return Math.round(lines.reduce((sum, line) => sum + Math.max(0, Math.min(100, Number(line.confidence) || 0)), 0) / lines.length);
}
function evidence(lines: LocatedLine[]): DeclarationEvidence[] {
  return lines.map(line => ({ imageId: line.image.id, view: line.image.view, filename: line.image.filename, excerpt: clean(line.text), confidence: Math.round(line.confidence), bbox: line.bbox }));
}
const nextFieldLabel = /\b(?:manufacturer|manufactured\s+by|packed\s+by|packer|imported\s+by|importer|marketed\s+by|country\s+of\s+origin|made\s+in|generic\s+(?:food\s+)?name|name\s+of\s+(?:the\s+)?food|net\s+(?:quantity|weight|contents?)|mfg\.?\s*(?:date|month)|manufactur(?:ing|e)\s+(?:date|month)|packed\s+on|best\s+before|use\s+by|expiry|mrp|unit\s+sale\s+price|consumer\s+care|customer\s+care|consumer\s+complaints)\b/i;

function locate(lines: LocatedLine[], pattern: RegExp, options: { nextLines?: number; stopAtLabels?: boolean; includeNext?: boolean } = {}): Extracted | null {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].text.match(pattern);
    if (!match) continue;
    const chunks = [clean(match[1] || '')];
    const matched = [lines[index]];
    if ((!chunks[0] || options.includeNext) && options.nextLines) {
      for (let offset = 1; offset <= options.nextLines && index + offset < lines.length; offset += 1) {
        const next = lines[index + offset];
        if (options.stopAtLabels !== false && nextFieldLabel.test(next.text)) break;
        const part = clean(next.text);
        if (part) { chunks.push(part); matched.push(next); }
      }
    }
    const value = clean(chunks.filter(Boolean).join(' '));
    if (value) return { value, lines: matched };
  }
  return null;
}

function field(match: Extracted | null): ProductDeclaration {
  return match ? { value: match.value, confidence: confidence(match.lines), status: 'detected', imageEvidence: evidence(match.lines) }
    : { value: null, confidence: 0, status: 'not_detected', imageEvidence: [] };
}

export function parseProductLabelDeclarations(images: ProductOcrImage[], scanReference: string, processedAt = new Date().toISOString()): ProductLabelOcrResult {
  const lines: LocatedLine[] = images.flatMap(({ id, view, filename, lines: imageLines }) => imageLines
    .filter(line => clean(line.text))
    .map(line => ({ ...line, image: { id, view, filename } })));

  const manufacturer = locate(lines, /\b(?:manufactured\s+by|manufacturer(?:\s+details?)?|packed\s+by|packer(?:\s+details?)?|imported\s+by|importer(?:\s+details?)?|marketed\s+by)\s*[:\-]?\s*(.*)$/i, { nextLines: 3, includeNext: true });
  const country = locate(lines, /\b(?:country\s+of\s+origin|origin\s+of\s+(?:the\s+)?product|made\s+in)\s*[:\-]?\s*(.+)$/i);
  const genericName = locate(lines, /\b(?:generic\s+(?:food\s+)?name|name\s+of\s+(?:the\s+)?food|food\s+name|product\s+name|name\s+of\s+(?:the\s+)?product)\s*[:\-]\s*(.+)$/i);
  const quantity = locate(lines, /\bnet\s*(?:quantity|qty\.?|weight|wt\.?|contents?)\s*[:\-]?\s*(.+)$/i);
  const manufactured = locate(lines, /\b(?:manufacturing\s+(?:month\s*(?:\/|and)?\s*year|date)|manufacture\s+date|mfg\.?\s*(?:date|dt\.?|month\s*(?:\/|and)?\s*year)|mfd\.?|date\s+of\s+manufacture|packed\s+on|pkd\.?)\s*[:\-]?\s*(.+)$/i);
  const bestBefore = locate(lines, /\b(?:best\s+before|use\s+by|use\s+before|expiry\s+date|expiry|expires?)\s*[:\-]?\s*(.+)$/i);
  const mrp = locate(lines, /\bmrp\b\s*(?:\(\s*(?:incl(?:uding)?\.?\s*)?(?:all\s*)?tax(?:es)?\s*\)|incl(?:uding)?\.?\s*(?:all\s*)?tax(?:es)?)?\s*[:\-]?\s*((?:₹|rs\.?|inr)?\s*[0-9][0-9,.]*(?:\s*\/\-)?)/i);
  const unitSale = locate(lines, /\b(?:unit\s+sale\s+price|unit\s+price|price\s+per\s+(?:kg|g|100\s*g|l|litre|liter|ml|unit))\s*[:\-]?\s*(.+)$/i);
  const consumerCare = locate(lines, /\b(?:consumer\s+care(?:\s+details?)?|customer\s+care(?:\s+details?)?|consumer\s+complaints?(?:\s+contact)?|contact\s+us)\s*[:\-]?\s*(.*)$/i, { nextLines: 3, includeNext: true });

  const declarations = {
    manufacturerPackerImporterDetails: field(manufacturer),
    countryOfOrigin: field(country),
    genericFoodName: field(genericName),
    netQuantity: field(quantity),
    manufacturingMonthYear: field(manufactured),
    bestBeforeUseBy: field(bestBefore),
    mrp: field(mrp),
    unitSalePrice: field(unitSale),
    consumerCareDetails: field(consumerCare),
  };
  const found = Object.values(declarations).filter(item => item.status === 'detected');
  const allEvidence = found.flatMap(item => item.imageEvidence);
  const visibilityValue = found.length === 0 ? 'not_detected' : found.length === Object.keys(declarations).length ? 'visible' : 'partially_visible';
  const visibilityConfidence = found.length ? Math.round(found.reduce((sum, item) => sum + item.confidence, 0) / found.length * (found.length / Object.keys(declarations).length)) : 0;

  return {
    engine: 'Tesseract.js 7 (Tesseract OCR)', scanReference, processedAt, sourceImageCount: images.length,
    declarations: {
      ...declarations,
      declarationVisibility: {
        value: visibilityValue, confidence: visibilityConfidence,
        note: 'OCR visibility estimate based only on declarations detected in the supplied photos; this is not a legal compliance judgment.',
        imageEvidence: allEvidence,
      },
    },
  };
}
