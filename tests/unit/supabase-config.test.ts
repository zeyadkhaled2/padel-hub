import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivilegedSupabaseKey,
  isPublishableSupabaseKey,
  parseAuthEnv,
  parseHttpOrigin,
  parseServiceEnv,
} from '@/server/supabase/env';

function fakeJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url');
  return `${header}.${payload}.signature`;
}

const ANON_JWT = fakeJwt('anon');
const SERVICE_JWT = fakeJwt('service_role');

test('parseHttpOrigin normalizes trailing slash and rejects unsafe or malformed values', () => {
  assert.equal(parseHttpOrigin('https://staging.supabase.co/'), 'https://staging.supabase.co');
  assert.equal(parseHttpOrigin('  http://127.0.0.1:54321/  ', { requireHttpsForRemote: true }), 'http://127.0.0.1:54321');
  assert.equal(parseHttpOrigin('http://localhost:3100', { requireHttpsForRemote: true }), 'http://localhost:3100');

  assert.equal(parseHttpOrigin(undefined), null);
  assert.equal(parseHttpOrigin(''), null);
  assert.equal(parseHttpOrigin('not-a-url'), null);
  assert.equal(parseHttpOrigin('javascript:alert(1)'), null);
  assert.equal(parseHttpOrigin('https://staging.supabase.co/rest/v1'), null);
  assert.equal(parseHttpOrigin('https://staging.supabase.co?foo=bar'), null);
  assert.equal(parseHttpOrigin('https://user:pass@staging.supabase.co'), null);
  assert.equal(parseHttpOrigin('http://staging.supabase.co', { requireHttpsForRemote: true }), null);
});

test('parseAuthEnv parses valid local and hosted configs without fallback to NEXT_PUBLIC vars', () => {
  const hosted = parseAuthEnv({
    PADELHUB_SUPABASE_URL: 'https://example-staging.supabase.co/',
    PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_key',
    PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example/',
  });
  assert.deepEqual(hosted, {
    url: 'https://example-staging.supabase.co',
    key: 'sb_publishable_example_key',
    origin: 'https://staging.padelhub.example',
  });

  // Never falls back to NEXT_PUBLIC_* or generic SUPABASE_* variables.
  const noFallback = parseAuthEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://prod.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT,
    SUPABASE_URL: 'https://prod.supabase.co',
    SUPABASE_ANON_KEY: ANON_JWT,
    PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
  });
  assert.equal(noFallback, null);
});

test('parseAuthEnv and parseServiceEnv reject missing, swapped, or mismatched credentials', () => {
  assert.equal(isPrivilegedSupabaseKey('sb_secret_test'), true);
  assert.equal(isPrivilegedSupabaseKey(SERVICE_JWT), true);
  assert.equal(isPrivilegedSupabaseKey('sb_publishable_test'), false);
  assert.equal(isPublishableSupabaseKey('sb_publishable_test'), true);
  assert.equal(isPublishableSupabaseKey(ANON_JWT), true);

  // Rejects secret or service_role JWT placed in publishable slot.
  assert.equal(
    parseAuthEnv({
      PADELHUB_SUPABASE_URL: 'https://example-staging.supabase.co',
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_accidental',
      PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
    }),
    null,
  );
  assert.equal(
    parseAuthEnv({
      PADELHUB_SUPABASE_URL: 'https://example-staging.supabase.co',
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: SERVICE_JWT,
      PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
    }),
    null,
  );

  // Rejects identical publishable and service keys.
  assert.equal(
    parseAuthEnv({
      PADELHUB_SUPABASE_URL: 'https://example-staging.supabase.co',
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'shared_key',
      PADELHUB_SUPABASE_SERVICE_ROLE_KEY: 'shared_key',
      PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
    }),
    null,
  );

  // Rejects publishable/anon key placed in service-role slot.
  assert.equal(
    parseServiceEnv({
      PADELHUB_SUPABASE_URL: 'https://example-staging.supabase.co',
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_valid',
      PADELHUB_SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_other',
      PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
    }),
    null,
  );
  assert.equal(
    parseServiceEnv({
      PADELHUB_SUPABASE_URL: 'https://example-staging.supabase.co',
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: ANON_JWT,
      PADELHUB_SUPABASE_SERVICE_ROLE_KEY: ANON_JWT,
      PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
    }),
    null,
  );

  // Accepts clean separation with both modern sb_* and legacy JWT keys.
  const modernService = parseServiceEnv({
    PADELHUB_SUPABASE_URL: 'https://example-staging.supabase.co',
    PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_valid',
    PADELHUB_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_valid',
    PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
  });
  assert.deepEqual(modernService, {
    url: 'https://example-staging.supabase.co',
    key: 'sb_secret_valid',
    origin: 'https://staging.padelhub.example',
  });

  const legacyService = parseServiceEnv({
    PADELHUB_SUPABASE_URL: 'http://127.0.0.1:54321',
    PADELHUB_SUPABASE_PUBLISHABLE_KEY: ANON_JWT,
    PADELHUB_SUPABASE_SERVICE_ROLE_KEY: SERVICE_JWT,
    PADELHUB_APP_ORIGIN: 'http://127.0.0.1:3100',
  });
  assert.deepEqual(legacyService, {
    url: 'http://127.0.0.1:54321',
    key: SERVICE_JWT,
    origin: 'http://127.0.0.1:3100',
  });
});
