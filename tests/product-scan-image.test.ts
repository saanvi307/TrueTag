import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanProductImageFilename, detectProductScanImageType, isProductImageView, isProductScanReference, PRODUCT_SCAN_IMAGE_MAX_BYTES } from '../lib/product-scan-image.ts';

test('recognizes supported image file signatures', () => {
  assert.equal(detectProductScanImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectProductScanImageType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(detectProductScanImageType(Buffer.from('RIFFxxxxWEBP')), 'image/webp');
  assert.equal(detectProductScanImageType(Buffer.from('not-an-image')), null);
  assert.equal(PRODUCT_SCAN_IMAGE_MAX_BYTES, 6 * 1024 * 1024);
});

test('accepts only expected view labels and UUID v4 scan references', () => {
  assert.equal(isProductImageView('front'), true);
  assert.equal(isProductImageView('back'), true);
  assert.equal(isProductImageView('side'), true);
  assert.equal(isProductImageView('other'), false);
  assert.equal(isProductScanReference('d9428888-122b-4b73-8153-7c2f6d3a19c1'), true);
  assert.equal(isProductScanReference('../other-scan'), false);
});

test('sanitizes client-supplied image names before persistence', () => {
  assert.equal(cleanProductImageFilename('../front\nlabel.jpg'), '.._front_label.jpg');
  assert.equal(cleanProductImageFilename(''), 'product-image');
  assert.equal(cleanProductImageFilename('x'.repeat(300)).length, 255);
});
