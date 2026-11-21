export type SupabaseAuthConfig = {
  url: string;
  key: string;
  origin: string;
};

export type SupabaseServiceConfig = SupabaseAuthConfig;

export type SupabaseEnvInput = Record<string, string | undefined>;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function parseHttpOrigin(
  raw: string | undefined,
  options: { requireHttpsForRemote?: boolean } = {},
): string | null {
  const value = raw?.trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  if (parsed.pathname !== '/') return null;
  if (options.requireHttpsForRemote && parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname)) {
    return null;
  }

  return parsed.origin;
}

function readJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload: unknown = JSON.parse(json);
    if (payload && typeof payload === 'object' && 'role' in payload && typeof payload.role === 'string') {
      return payload.role;
    }
    return null;
  } catch {
    return null;
  }
}

export function isPrivilegedSupabaseKey(key: string): boolean {
  return key.startsWith('sb_secret_') || readJwtRole(key) === 'service_role';
}

export function isPublishableSupabaseKey(key: string): boolean {
  return key.startsWith('sb_publishable_') || readJwtRole(key) === 'anon';
}

function cleanKey(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value || /\s/.test(value)) return null;
  return value;
}

// Dedicated PADELHUB_* variables deliberately never fall back to NEXT_PUBLIC_* or
// generic SUPABASE_* variables so local, staging, and production stay isolated.
export function parseAuthEnv(env: SupabaseEnvInput): SupabaseAuthConfig | null {
  const url = parseHttpOrigin(env.PADELHUB_SUPABASE_URL, { requireHttpsForRemote: true });
  const origin = parseHttpOrigin(env.PADELHUB_APP_ORIGIN);
  const key = cleanKey(env.PADELHUB_SUPABASE_PUBLISHABLE_KEY);
  const serviceKey = cleanKey(env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !origin || !key) return null;
  if (isPrivilegedSupabaseKey(key)) return null;
  if (serviceKey && key === serviceKey) return null;

  return { url, key, origin };
}

export function parseServiceEnv(env: SupabaseEnvInput): SupabaseServiceConfig | null {
  const auth = parseAuthEnv(env);
  const key = cleanKey(env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY);

  if (!auth || !key) return null;
  if (isPublishableSupabaseKey(key) || key === auth.key) return null;

  return { url: auth.url, key, origin: auth.origin };
}
