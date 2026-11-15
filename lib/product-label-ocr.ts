import tesseract from 'tesseract.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseProductLabelDeclarations, type ProductImageView, type ProductOcrLine } from './product-label-parser.ts';

const { createWorker, OEM } = tesseract;
export const MAX_PRODUCT_OCR_IMAGES = 10;

export type ProductOcrSourceImage = { id: number; view: ProductImageView; filename: string; imageData: Buffer };

const bundledEnglishData = join(process.cwd(), 'assets', 'tessdata');

export async function recognizeProductLabelImages(images: ProductOcrSourceImage[], scanReference: string) {
  if (images.length === 0) throw new Error('Upload at least one product image before running OCR.');
  if (images.length > MAX_PRODUCT_OCR_IMAGES) throw new Error(`OCR supports up to ${MAX_PRODUCT_OCR_IMAGES} images per run. Start with the front, back, and clearest side photos.`);

  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    cachePath: process.env.TESSERACT_CACHE_PATH || join(tmpdir(), 'trutag-tesseract'),
    langPath: process.env.TESSERACT_LANG_PATH || bundledEnglishData,
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const recognized = [] as { id: number; view: ProductImageView; filename: string; lines: ProductOcrLine[] }[];
    for (const image of images) {
      const { data } = await worker.recognize(image.imageData, {}, { text: true, blocks: true });
      const lines = (data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines))
        .map(line => ({ text: line.text, confidence: line.confidence, bbox: line.bbox }));
      recognized.push({ id: image.id, view: image.view, filename: image.filename, lines });
    }
    return parseProductLabelDeclarations(recognized, scanReference);
  } finally {
    await worker.terminate();
  }
}
