export function getConfiguredAppBaseUrl(configuredBaseUrl = process.env.APP_BASE_URL) {
  if (!configuredBaseUrl?.trim()) throw new Error('APP_BASE_URL must be set to the application URL that QR scanners can reach.');

  let base: URL;
  try { base = new URL(configuredBaseUrl); }
  catch { throw new Error('APP_BASE_URL must be a valid application origin.'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('APP_BASE_URL must contain only an http(s) application origin, without credentials, path, query, or fragment.');
  }
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTPS in production.');
  }
  if (process.env.NODE_ENV === 'production' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(base.hostname.toLowerCase())) {
    throw new Error('APP_BASE_URL must use a host reachable by QR scanners in production; localhost is not allowed.');
  }
  return base.origin;
}

export function buildInspectionVerificationUrl(token: string, configuredBaseUrl = process.env.APP_BASE_URL) {
  if (!token || token.length > 4096) throw new Error('A valid inspection token is required to build a verification URL.');
  const baseOrigin = getConfiguredAppBaseUrl(configuredBaseUrl);

  const verificationUrl = new URL('/verify', baseOrigin);
  verificationUrl.hash = new URLSearchParams({ token }).toString();
  return verificationUrl.toString();
}

export function extractInspectionToken(location: string) {
  let url: URL;
  try { url = new URL(location); }
  catch { return null; }
  const fragmentToken = new URLSearchParams(url.hash.slice(1)).get('token');
  const queryToken = url.searchParams.get('token');
  if (fragmentToken && queryToken && fragmentToken !== queryToken) return null;
  return fragmentToken || queryToken || null;
}
