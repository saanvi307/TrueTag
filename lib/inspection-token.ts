import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type InspectionPayload = { v: 1; jti: string; exp: number };

function secret() {
  const value = process.env.INSPECTION_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error('INSPECTION_TOKEN_SECRET must be configured with at least 32 characters.');
  return value;
}

export function createInspectionToken(input: Pick<InspectionPayload, 'exp'>) {
  const payload: InspectionPayload = { v: 1, jti: randomUUID(), ...input };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signed = `v1.${encoded}`;
  const signature = createHmac('sha256', secret()).update(signed).digest('base64url');
  return { token: `${signed}.${signature}`, payload };
}

export function parseInspectionToken(token: string): InspectionPayload | null {
  if (token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  try {
    const expected = createHmac('sha256', secret()).update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as InspectionPayload;
    if (payload.v !== 1 || typeof payload.jti !== 'string' || !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function matchesInspectionTokenRecord(
  payload: InspectionPayload,
  record: { token_id: string; expires_at: string; revoked_at: Date | string | null },
) {
  const expiresAt = Date.parse(`${record.expires_at.replace(' ', 'T')}Z`);
  return record.token_id === payload.jti
    && Number.isFinite(expiresAt)
    && Math.floor(expiresAt / 1000) === payload.exp
    && record.revoked_at === null;
}

export function hashInspectionToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
