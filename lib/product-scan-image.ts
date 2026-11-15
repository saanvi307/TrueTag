export const PRODUCT_SCAN_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const PRODUCT_SCAN_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ProductScanImageType = (typeof PRODUCT_SCAN_IMAGE_TYPES)[number];
export type ProductImageView = 'front' | 'back' | 'side';

export function detectProductScanImageType(bytes: Uint8Array): ProductScanImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export function isProductScanReference(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isProductImageView(value: string): value is ProductImageView {
  return value === 'front' || value === 'back' || value === 'side';
}

export function cleanProductImageFilename(value: string): string {
  return value.replace(/[\\/\0\r\n]/g, '_').trim().slice(0, 255) || 'product-image';
}
