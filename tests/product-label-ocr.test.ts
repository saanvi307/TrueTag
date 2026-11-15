import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pngjs from 'pngjs';
import { recognizeProductLabelImages } from '../lib/product-label-ocr.ts';

test('recognizes printed declaration text and returns confidence with image evidence', async () => {
  const imageData = await readFile(new URL('./fixtures/product-label-mrp.png', import.meta.url));
  const result = await recognizeProductLabelImages([{
    id: 2, view: 'front', filename: 'product-label-mrp.png', imageData,
  }], 'd9428888-122b-4b73-8153-7c2f6d3a19c1');
  const mrp = result.declarations.mrp;
  assert.match(mrp.value || '', /99\.00/);
  assert.ok(mrp.confidence > 0);
  assert.equal(mrp.imageEvidence[0].imageId, 2);
  assert.equal(mrp.imageEvidence[0].filename, 'product-label-mrp.png');
  assert.ok(mrp.imageEvidence[0].bbox.x1 > mrp.imageEvidence[0].bbox.x0);
});

test('bundled Tesseract engine processes an image and leaves absent declarations empty', async () => {
  const png = new pngjs.PNG({ width: 120, height: 80 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 255;
    png.data[index + 1] = 255;
    png.data[index + 2] = 255;
    png.data[index + 3] = 255;
  }
  const result = await recognizeProductLabelImages([{
    id: 1, view: 'front', filename: 'blank-test.png', imageData: pngjs.PNG.sync.write(png),
  }], 'd9428888-122b-4b73-8153-7c2f6d3a19c1');
  assert.equal(result.engine, 'Tesseract.js 7 (Tesseract OCR)');
  assert.equal(result.sourceImageCount, 1);
  assert.equal(result.declarations.mrp.value, null);
  assert.equal(result.declarations.declarationVisibility.value, 'not_detected');
});
