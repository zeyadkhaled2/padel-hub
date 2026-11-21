// Shared loader and validation helpers for hosted staging scripts.
// Reads .env.staging.local (gitignored) into memory only; never prints secret values.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const PROJECT_REF_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const HOSTED_SUPABASE_HOST_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.supabase\.co$/;
const DIRECT_DB_HOST_RE = /^db\.([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.supabase\.co$/;
const POOLER_DB_HOST_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.pooler\.supabase\.com$/;
const POOLER_USER_RE = /^postgres\.([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/i;

function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function readJwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && typeof payload.role === 'string'
      ? payload.role
      : null;
  } catch {
    return null;
  }
}

function isPrivilegedSupabaseKey(key) {
  return key.startsWith('sb_secret_') || readJwtRole(key) === 'service_role';
}

function isPublishableSupabaseKey(key) {
  return key.startsWith('sb_publishable_') || readJwtRole(key) === 'anon';
}

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

export function extractSupabaseProjectRef(supabaseUrl) {
  const raw = typeof supabaseUrl === 'string' ? supabaseUrl.trim() : '';
  if (!raw) {
    throw new Error('Missing PADELHUB_SUPABASE_URL.');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('PADELHUB_SUPABASE_URL is not a valid HTTPS origin.');
  }

  if (parsed.protocol !== 'https:' || isLoopbackHost(parsed.hostname)) {
    throw new Error('Staging scripts require an HTTPS hosted Supabase URL (refusing localhost/127.0.0.1).');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('PADELHUB_SUPABASE_URL must be a bare origin (https://<project-ref>.supabase.co) without path, query, or credentials.');
  }

  const match = HOSTED_SUPABASE_HOST_RE.exec(parsed.hostname.toLowerCase());
  if (!match) {
    throw new Error('Staging URL must point to a hosted https://<project-ref>.supabase.co project.');
  }

  return { origin: parsed.origin, projectRef: match[1] };
}

export function validateHostedAppOrigin(originRaw) {
  const raw = typeof originRaw === 'string' ? originRaw.trim() : '';
  if (!raw) {
    throw new Error('PADELHUB_APP_ORIGIN must be an http:// loopback or https:// hosted origin.');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('PADELHUB_APP_ORIGIN is not a valid origin.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('PADELHUB_APP_ORIGIN must be an http:// loopback or https:// hosted origin.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('PADELHUB_APP_ORIGIN must be a bare origin without path, query, fragment, or credentials.');
  }
  if (parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname)) {
    throw new Error(
      'PADELHUB_APP_ORIGIN must use https:// for non-loopback hosts (http:// is allowed only for localhost, 127.0.0.1, or [::1]).',
    );
  }

  return parsed.origin;
}

export function validateStagingDbUrl(dbUrl, expectedProjectRef) {
  const expectedRef = typeof expectedProjectRef === 'string' ? expectedProjectRef.trim().toLowerCase() : '';
  if (!PROJECT_REF_RE.test(expectedRef)) {
    throw new Error('Expected Supabase project ref is missing or invalid.');
  }

  const raw = typeof dbUrl === 'string' ? dbUrl.trim() : '';
  if (!raw) {
    throw new Error(
      `Missing PADELHUB_STAGING_DB_URL in .env.staging.local (Supabase postgresql:// URI for project "${expectedRef}").`,
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    // Never include the raw DB URI or native URL parse error in thrown output.
    throw new Error('PADELHUB_STAGING_DB_URL is not a valid postgresql:// URI.');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('PADELHUB_STAGING_DB_URL must use the postgresql:// or postgres:// protocol.');
  }

  if (!parsed.password) {
    throw new Error('PADELHUB_STAGING_DB_URL must include a database password.');
  }

  let decodedPassword = parsed.password;
  try {
    decodedPassword = decodeURIComponent(parsed.password);
  } catch {
    // Keep raw value for bracket inspection; never echo it.
  }
  if (
    parsed.password.startsWith('%5B') ||
    parsed.password.startsWith('%5b') ||
    parsed.password.startsWith('[') ||
    decodedPassword.startsWith('[') ||
    decodedPassword.endsWith(']')
  ) {
    throw new Error(
      'PADELHUB_STAGING_DB_URL password appears wrapped in literal [brackets]; remove [ and ] around the password.',
    );
  }

  if (parsed.pathname !== '/postgres' && parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('PADELHUB_STAGING_DB_URL must target the default "postgres" database.');
  }

  for (const [, value] of parsed.searchParams) {
    const refMatches = value.matchAll(/reference=([^\s,&]+)/gi);
    for (const refMatch of refMatches) {
      if (refMatch[1].toLowerCase() !== expectedRef) {
        throw new Error(
          `PADELHUB_STAGING_DB_URL query options reference does not match PADELHUB_SUPABASE_URL project "${expectedRef}".`,
        );
      }
    }
  }

  let decodedUser;
  try {
    decodedUser = decodeURIComponent(parsed.username);
  } catch {
    throw new Error('PADELHUB_STAGING_DB_URL contains an invalid URL-encoded username.');
  }

  const host = parsed.hostname.toLowerCase();
  if (isLoopbackHost(host)) {
    throw new Error(
      `PADELHUB_STAGING_DB_URL must target hosted Supabase project "${expectedRef}" (refusing localhost/loopback hosts).`,
    );
  }

  const directMatch = DIRECT_DB_HOST_RE.exec(host);
  if (directMatch) {
    const actualRef = directMatch[1];
    if (actualRef !== expectedRef) {
      throw new Error(
        `PADELHUB_STAGING_DB_URL direct database host targets project "${actualRef}", which does not match PADELHUB_SUPABASE_URL project "${expectedRef}".`,
      );
    }
    if (decodedUser !== 'postgres' && decodedUser.toLowerCase() !== `postgres.${expectedRef}`) {
      throw new Error(
        `PADELHUB_STAGING_DB_URL direct database username must be "postgres" or "postgres.${expectedRef}".`,
      );
    }
    return { mode: 'direct', host, projectRef: expectedRef };
  }

  const poolerMatch = POOLER_DB_HOST_RE.exec(host);
  if (poolerMatch) {
    const userMatch = POOLER_USER_RE.exec(decodedUser);
    if (!userMatch) {
      throw new Error(
        `PADELHUB_STAGING_DB_URL pooler username must be "postgres.${expectedRef}" to match PADELHUB_SUPABASE_URL.`,
      );
    }
    const actualRef = userMatch[1].toLowerCase();
    if (actualRef !== expectedRef) {
      throw new Error(
        `PADELHUB_STAGING_DB_URL pooler username targets project "${actualRef}", which does not match PADELHUB_SUPABASE_URL project "${expectedRef}".`,
      );
    }
    return { mode: 'pooler', host, projectRef: expectedRef };
  }

  throw new Error(
    `PADELHUB_STAGING_DB_URL host "${host}" is not a valid Supabase direct or pooler host for project "${expectedRef}".`,
  );
}

export function requireSmokeAdminState(adminState) {
  if (!adminState || typeof adminState !== 'object') {
    throw new Error(
      'Missing smoke admin state (.cache/staging-admin-smoke.json). Full staging smoke requires admin MFA verification: run "node scripts/staging-app.mjs prepare-smoke-admin" and grant the returned userId in private.admin_roles before running smoke.',
    );
  }

  const userId = typeof adminState.userId === 'string' ? adminState.userId.trim() : '';
  const email = typeof adminState.email === 'string' ? adminState.email.trim() : '';
  const password = typeof adminState.password === 'string' ? adminState.password : '';

  if (!userId || !email || !password) {
    throw new Error(
      'Invalid smoke admin state (.cache/staging-admin-smoke.json): userId, email, and password are required for mandatory admin MFA smoke verification.',
    );
  }

  return { ...adminState, userId, email, password };
}

export function loadSmokeAdminState(adminStatePath) {
  if (!existsSync(adminStatePath)) {
    return requireSmokeAdminState(null);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(adminStatePath, 'utf8'));
  } catch {
    throw new Error(
      'Malformed smoke admin state (.cache/staging-admin-smoke.json). Re-run "node scripts/staging-app.mjs prepare-smoke-admin" before running smoke.',
    );
  }

  return requireSmokeAdminState(parsed);
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

  if (/\s/.test(pubKey) || /\s/.test(serviceKey)) {
    throw new Error('Supabase API keys must not contain whitespace.');
  }

  const supabase = extractSupabaseProjectRef(urlRaw);
  const appOrigin = validateHostedAppOrigin(originRaw);

  if (
    pubKey === serviceKey ||
    isPrivilegedSupabaseKey(pubKey) ||
    isPublishableSupabaseKey(serviceKey)
  ) {
    throw new Error('Publishable and service-role keys appear swapped or identical.');
  }

  return {
    supabaseUrl: supabase.origin,
    projectRef: supabase.projectRef,
    publishableKey: pubKey,
    serviceRoleKey: serviceKey,
    appOrigin,
    dbUrl: env.PADELHUB_STAGING_DB_URL?.trim() || null,
  };
}
