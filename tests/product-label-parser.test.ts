import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProductLabelDeclarations, type ProductOcrImage } from '../lib/product-label-parser.ts';

const bbox = { x0: 20, y0: 40, x1: 220, y1: 58 };
const lines = (values: string[]) => values.map(text => ({ text, confidence: 88, bbox }));

test('extracts labeled declarations with OCR confidence and source image evidence', () => {
  const images: ProductOcrImage[] = [
    { id: 11, view: 'back', filename: 'back.jpg', lines: lines([
      'Manufactured by: Sample Foods Pvt Ltd, Pune',
      'Country of Origin: India',
      'Generic Food Name: Roasted gram flour',
      'Net Quantity: 500 g',
      'Mfg Date: 08/2026',
      'Best Before: 6 months from manufacture',
      'MRP ₹ 99.00',
      'Unit Sale Price: ₹ 19.80 per 100 g',
      'Consumer Care: care@example.test 1800 000 000',
    ]) },
  ];
  const result = parseProductLabelDeclarations(images, 'd9428888-122b-4b73-8153-7c2f6d3a19c1', '2026-11-15T00:00:00.000Z');
  assert.equal(result.engine, 'Tesseract.js 7 (Tesseract OCR)');
  assert.equal(result.declarations.manufacturerPackerImporterDetails.value, 'Sample Foods Pvt Ltd, Pune');
  assert.equal(result.declarations.countryOfOrigin.value, 'India');
  assert.equal(result.declarations.genericFoodName.value, 'Roasted gram flour');
  assert.equal(result.declarations.netQuantity.value, '500 g');
  assert.equal(result.declarations.manufacturingMonthYear.value, '08/2026');
  assert.equal(result.declarations.bestBeforeUseBy.value, '6 months from manufacture');
  assert.equal(result.declarations.mrp.value, '₹ 99.00');
  assert.equal(result.declarations.unitSalePrice.value, '₹ 19.80 per 100 g');
  assert.equal(result.declarations.consumerCareDetails.value, 'care@example.test 1800 000 000');
  assert.equal(result.declarations.declarationVisibility.value, 'visible');
  assert.equal(result.declarations.countryOfOrigin.confidence, 88);
  assert.deepEqual(result.declarations.countryOfOrigin.imageEvidence[0], { imageId: 11, view: 'back', filename: 'back.jpg', excerpt: 'Country of Origin: India', confidence: 88, bbox });
});

test('leaves absent label details null and reports visibility as partial without inventing values', () => {
  const result = parseProductLabelDeclarations([{ id: 4, view: 'front', filename: 'front.png', lines: lines(['MRP ₹ 20']) }], 'd9428888-122b-4b73-8153-7c2f6d3a19c1');
  assert.equal(result.declarations.mrp.value, '₹ 20');
  assert.equal(result.declarations.countryOfOrigin.value, null);
  assert.equal(result.declarations.countryOfOrigin.confidence, 0);
  assert.deepEqual(result.declarations.countryOfOrigin.imageEvidence, []);
  assert.equal(result.declarations.declarationVisibility.value, 'partially_visible');
});

test('reports no declarations when OCR lines contain no recognized declaration labels', () => {
  const result = parseProductLabelDeclarations([{ id: 4, view: 'front', filename: 'front.png', lines: lines(['A brand name with no declaration values']) }], 'd9428888-122b-4b73-8153-7c2f6d3a19c1');
  for (const value of Object.values(result.declarations)) {
    if ('status' in value) assert.equal(value.value, null);
  }
  assert.equal(result.declarations.declarationVisibility.value, 'not_detected');
});
