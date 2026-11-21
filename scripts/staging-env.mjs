// Shared loader for hosted staging scripts.
// Reads .env.staging.local (gitignored) into memory only; never prints secret values.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const entries = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) entries[key] = value;
  }
  return entries;
}

export function loadStagingEnv(cwd = process.cwd()) {
  const fileValues = parseEnvFile(resolve(cwd, '.env.staging.local'));
  // Explicit process.env overrides file values.
  const merged = { ...fileValues };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && v !== '') merged[k] = v;
  }
  return merged;
}

export function requireHostedStagingConfig(env) {
  const urlRaw = env.PADELHUB_SUPABASE_URL?.trim();
  const pubKey = env.PADELHUB_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceKey = env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const originRaw = (env.PADELHUB_APP_ORIGIN || 'http://127.0.0.1:3100').trim();

  if (!urlRaw || !pubKey || !serviceKey) {
    throw new Error(
      'Missing required staging variables (PADELHUB_SUPABASE_URL, PADELHUB_SUPABASE_PUBLISHABLE_KEY, PADELHUB_SUPABASE_SERVICE_ROLE_KEY). Populate gitignored .env.staging.local or export them in your shell.',
    );
  }

  const parsedUrl = new URL(urlRaw);
  if (parsedUrl.protocol !== 'https:' || LOOPBACK_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error('Staging scripts require an HTTPS hosted Supabase URL (refusing localhost/127.0.0.1).');
  }
  if (!parsedUrl.hostname.endsWith('.supabase.co')) {
    throw new Error('Staging URL must point to a hosted *.supabase.co project.');
  }

  const parsedOrigin = new URL(originRaw);
  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    throw new Error('PADELHUB_APP_ORIGIN must be an http:// or https:// origin.');
  }

  if (pubKey === serviceKey || pubKey.startsWith('sb_secret_') || serviceKey.startsWith('sb_publishable_')) {
    throw new Error('Publishable and service-role keys appear swapped or identical.');
  }

  return {
    supabaseUrl: parsedUrl.origin,
    publishableKey: pubKey,
    serviceRoleKey: serviceKey,
    appOrigin: parsedOrigin.origin,
    dbUrl: env.PADELHUB_STAGING_DB_URL?.trim() || null,
  };
}
