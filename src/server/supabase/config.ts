import 'server-only';

// Dedicated variables deliberately do not fall back to an existing hosted .env.local.
export function authConfig() {
  const url = process.env.PADELHUB_SUPABASE_URL;
  const key = process.env.PADELHUB_SUPABASE_PUBLISHABLE_KEY;
  const origin = process.env.PADELHUB_APP_ORIGIN;
  if (!url || !key || !origin) return null;
  return { url, key, origin: new URL(origin).origin };
}
