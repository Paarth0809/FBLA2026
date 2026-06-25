// Build absolute URLs for emails and notifications. Centralizing this avoids
// hard-coded localhost links leaking into Vercel messages.
function configuredBaseUrl(req) {
  const explicit = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.trim().replace(/\/+$/, '');

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, '')}`;
  }

  if (req) {
    const host = req.get?.('host') || 'localhost:3000';
    const protocol = req.protocol || (host.includes('localhost') ? 'http' : 'https');
    return `${protocol}://${host}`;
  }

  return `http://localhost:${process.env.PORT || 3000}`;
}

function publicUrl(pathname = '/', req) {
  const path = String(pathname || '/');
  return `${configuredBaseUrl(req)}${path.startsWith('/') ? path : `/${path}`}`;
}

module.exports = { configuredBaseUrl, publicUrl };
