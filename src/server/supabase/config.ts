import 'server-only';
import {
  parseAuthEnv,
  parseServiceEnv,
  type SupabaseAuthConfig,
  type SupabaseServiceConfig,
} from './env';

// Dedicated variables deliberately do not fall back to an existing hosted .env.local.
export function authConfig(): SupabaseAuthConfig | null {
  return parseAuthEnv(process.env);
}

// Server-only privileged credentials for Storage uploads/downloads, consented WhatsApp
// lookups, and best-effort analytics recording. Never expose in NEXT_PUBLIC_* variables.
export function serviceConfig(): SupabaseServiceConfig | null {
  return parseServiceEnv(process.env);
}
