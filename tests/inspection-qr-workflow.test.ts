import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import pngjs from 'pngjs';
import { createInspectionToken, matchesInspectionTokenRecord, parseInspectionToken } from '../lib/inspection-token.ts';
import { buildInspectionVerificationUrl, extractInspectionToken, getConfiguredAppBaseUrl } from '../lib/inspection-verification-url.ts';

process.env.INSPECTION_TOKEN_SECRET = randomBytes(32).toString('hex');

test('QR encoder carries the complete configured public verification URL and signed token', async () => {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const issued = createInspectionToken({ exp: expiresAt });
  const url = buildInspectionVerificationUrl(issued.token, 'https://verify.trutag.example');
  const qr = QRCode.create(url);
  const encodedText = Buffer.concat(qr.segments.map(segment => Buffer.from(segment.data))).toString('utf8');
  const qrDataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 280 });
  const png = pngjs.PNG.sync.read(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

  assert.equal(encodedText, url);
  assert.equal(decoded?.data, url);
  assert.equal(new URL(url).origin, 'https://verify.trutag.example');
  assert.equal(new URL(url).pathname, '/verify');
  const extracted = extractInspectionToken(encodedText);
  assert.equal(extracted, issued.token);
  assert.equal(parseInspectionToken(extracted!)?.jti, issued.payload.jti);
});

test('each issuance has a unique signed token and cannot match another token record', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const first = createInspectionToken({ exp });
  const second = createInspectionToken({ exp });
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.payload.jti, second.payload.jti);

  const record = (issued: typeof first) => ({
    token_id: issued.payload.jti,
    expires_at: new Date(issued.payload.exp * 1000).toISOString().slice(0, 19).replace('T', ' '),
    revoked_at: null,
  });
  assert.equal(matchesInspectionTokenRecord(parseInspectionToken(first.token)!, record(first)), true);
  assert.equal(matchesInspectionTokenRecord(parseInspectionToken(first.token)!, record(second)), false);
  assert.equal(matchesInspectionTokenRecord(parseInspectionToken(first.token)!, { ...record(first), revoked_at: new Date() }), false);
});

test('modified, expired, and missing tokens are rejected', () => {
  const valid = createInspectionToken({ exp: Math.floor(Date.now() / 1000) + 3600 }).token;
  const [version, payload, signature] = valid.split('.');
  const firstSignatureCharacter = signature[0];
  const tamperedSignature = `${firstSignatureCharacter === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const tampered = `${version}.${payload}.${tamperedSignature}`;
  const expired = createInspectionToken({ exp: Math.floor(Date.now() / 1000) - 1 }).token;

  assert.equal(parseInspectionToken(tampered), null);
  assert.equal(parseInspectionToken(expired), null);
  assert.equal(parseInspectionToken('not-a-valid-token'), null);
  assert.equal(extractInspectionToken('https://verify.trutag.example/verify'), null);
  assert.equal(extractInspectionToken(`https://verify.trutag.example/verify?token=${encodeURIComponent(valid)}`), valid);
});

test('QR generation refuses to guess an application host when APP_BASE_URL is missing', () => {
  assert.throws(() => getConfiguredAppBaseUrl(''), /APP_BASE_URL/);
  assert.equal(getConfiguredAppBaseUrl('https://verify.trutag.example'), 'https://verify.trutag.example');
});
