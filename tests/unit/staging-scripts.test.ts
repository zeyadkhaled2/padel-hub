import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  extractSupabaseProjectRef,
  loadSmokeAdminState,
  requireHostedStagingConfig,
  requireSmokeAdminState,
  validateHostedAppOrigin,
  validateStagingDbUrl,
} from '../../scripts/staging-env.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stagingAppScript = resolve(repoRoot, 'scripts/staging-app.mjs');
const CANARY_DB_PASSWORD = 'CANARY_SECRET_DB_PASS_12345';

function fakeJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url');
  return `${header}.${payload}.signature`;
}

function runStagingCli(
  mode: string,
  extraEnv: Record<string, string>,
  cwd: string,
) {
  const sanitizedEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    COMSPEC: process.env.COMSPEC,
    ...extraEnv,
  };
  return spawnSync(process.execPath, [stagingAppScript, mode], {
    cwd,
    env: sanitizedEnv,
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('extractSupabaseProjectRef validates hosted Supabase URLs and extracts normalized project ref', () => {
  assert.deepEqual(
    extractSupabaseProjectRef('https://sxghreukdkxclymysryp.supabase.co/'),
    {
      origin: 'https://sxghreukdkxclymysryp.supabase.co',
      projectRef: 'sxghreukdkxclymysryp',
    },
  );
  assert.deepEqual(
    extractSupabaseProjectRef('https://Example-Staging.supabase.co'),
    {
      origin: 'https://example-staging.supabase.co',
      projectRef: 'example-staging',
    },
  );

  for (const invalidUrl of [
    '',
    'http://sxghreukdkxclymysryp.supabase.co',
    'http://127.0.0.1:54321',
    'https://db.sxghreukdkxclymysryp.supabase.co',
    'https://evil.example.com',
    'https://sxghreukdkxclymysryp.supabase.co/rest/v1',
    'https://sxghreukdkxclymysryp.supabase.co?x=1',
    'https://user:pass@sxghreukdkxclymysryp.supabase.co',
  ]) {
    assert.throws(() => extractSupabaseProjectRef(invalidUrl), `Expected rejection for ${invalidUrl}`);
  }
});

test('validateHostedAppOrigin and requireHostedStagingConfig reject non-HTTPS hosted app origins', () => {
  assert.equal(validateHostedAppOrigin('https://staging.padelhub.example/'), 'https://staging.padelhub.example');
  assert.equal(validateHostedAppOrigin('http://127.0.0.1:3100/'), 'http://127.0.0.1:3100');
  assert.equal(validateHostedAppOrigin('http://localhost:3100'), 'http://localhost:3100');
  assert.equal(validateHostedAppOrigin('http://[::1]:3100'), 'http://[::1]:3100');

  for (const badOrigin of [
    'http://staging.padelhub.example',
    'http://padel-hub-beta.vercel.app',
    'http://192.168.1.50:3100',
    'http://localhost.evil.example',
    'https://staging.padelhub.example/en',
    'https://staging.padelhub.example?a=1',
    'https://user:pass@staging.padelhub.example',
    'ftp://staging.padelhub.example',
  ]) {
    assert.throws(() => validateHostedAppOrigin(badOrigin), `Expected rejection for ${badOrigin}`);
    assert.throws(
      () =>
        requireHostedStagingConfig({
          PADELHUB_SUPABASE_URL: 'https://stagingref1234.supabase.co',
          PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_valid',
          PADELHUB_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_valid',
          PADELHUB_APP_ORIGIN: badOrigin,
        }),
      `requireHostedStagingConfig should reject ${badOrigin}`,
    );
  }

  const valid = requireHostedStagingConfig({
    PADELHUB_SUPABASE_URL: 'https://stagingref1234.supabase.co/',
    PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_valid',
    PADELHUB_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_valid',
    PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example/',
  });
  assert.equal(valid.projectRef, 'stagingref1234');
  assert.equal(valid.supabaseUrl, 'https://stagingref1234.supabase.co');
  assert.equal(valid.appOrigin, 'https://staging.padelhub.example');

  // Also catches swapped legacy JWT roles.
  assert.throws(() =>
    requireHostedStagingConfig({
      PADELHUB_SUPABASE_URL: 'https://stagingref1234.supabase.co',
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: fakeJwt('service_role'),
      PADELHUB_SUPABASE_SERVICE_ROLE_KEY: fakeJwt('anon'),
      PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
    }),
  );
});

test('validateStagingDbUrl matches expected Supabase project ref and never leaks DB passwords', () => {
  const expectedRef = 'stagingref1234';

  assert.deepEqual(
    validateStagingDbUrl(
      `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
      expectedRef,
    ),
    {
      mode: 'pooler',
      host: 'aws-0-eu-central-1.pooler.supabase.com',
      projectRef: expectedRef,
    },
  );
  assert.deepEqual(
    validateStagingDbUrl(
      `postgres://postgres%2E${expectedRef}:${CANARY_DB_PASSWORD}@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`,
      expectedRef,
    ),
    {
      mode: 'pooler',
      host: 'aws-1-eu-central-1.pooler.supabase.com',
      projectRef: expectedRef,
    },
  );
  assert.deepEqual(
    validateStagingDbUrl(
      `postgresql://postgres:${CANARY_DB_PASSWORD}@db.${expectedRef}.supabase.co:5432/postgres`,
      expectedRef,
    ),
    {
      mode: 'direct',
      host: `db.${expectedRef}.supabase.co`,
      projectRef: expectedRef,
    },
  );
  assert.deepEqual(
    validateStagingDbUrl(
      `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@db.${expectedRef}.supabase.co:5432/postgres`,
      expectedRef,
    ),
    {
      mode: 'direct',
      host: `db.${expectedRef}.supabase.co`,
      projectRef: expectedRef,
    },
  );

  const rejectedDbUrls = [
    '',
    'not a url at all ' + CANARY_DB_PASSWORD,
    `https://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com/postgres`,
    `postgresql://postgres.${expectedRef}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${expectedRef}:[${CANARY_DB_PASSWORD}]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${expectedRef}:%5B${CANARY_DB_PASSWORD}%5D@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.prodref9999:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${CANARY_DB_PASSWORD}@db.prodref9999.supabase.co:5432/postgres`,
    `postgresql://postgres.prodref9999:${CANARY_DB_PASSWORD}@db.${expectedRef}.supabase.co:5432/postgres`,
    `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?options=reference%3Dprodref9999`,
    `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@127.0.0.1:54322/postgres`,
    `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@localhost:54322/postgres`,
    `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@evil.example.com:5432/postgres`,
    `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com.evil.com:5432/postgres`,
    `postgresql://postgres.${expectedRef}:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/otherdb`,
  ];

  for (const badDbUrl of rejectedDbUrls) {
    assert.throws(
      () => validateStagingDbUrl(badDbUrl, expectedRef),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(
          err.message.includes(CANARY_DB_PASSWORD),
          false,
          `Error message must never echo DB password (got: ${err.message})`,
        );
        return true;
      },
      `Expected validateStagingDbUrl to reject mismatched/invalid URI`,
    );
  }
});

test('requireSmokeAdminState and loadSmokeAdminState enforce mandatory admin MFA state', () => {
  assert.throws(() => requireSmokeAdminState(null), /Missing smoke admin state/);
  assert.throws(() => requireSmokeAdminState({}), /userId, email, and password are required/);
  assert.throws(
    () => requireSmokeAdminState({ userId: 'u-1', email: 'admin@example.test', password: '' }),
    /userId, email, and password are required/,
  );

  const valid = requireSmokeAdminState({
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.test',
    password: 'StrongSmokePassword!1',
  });
  assert.equal(valid.userId, '11111111-1111-4111-8111-111111111111');

  const dir = mkdtempSync(resolve(tmpdir(), 'padelhub-smoke-state-'));
  try {
    const missingPath = resolve(dir, '.cache', 'staging-admin-smoke.json');
    assert.throws(() => loadSmokeAdminState(missingPath), /Missing smoke admin state/);

    mkdirSync(resolve(dir, '.cache'), { recursive: true });
    writeFileSync(missingPath, '{not-json', 'utf8');
    assert.throws(() => loadSmokeAdminState(missingPath), /Malformed smoke admin state/);

    writeFileSync(missingPath, JSON.stringify({ email: 'only-email@example.test' }), 'utf8');
    assert.throws(() => loadSmokeAdminState(missingPath), /userId, email, and password are required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('staging-app CLI enforces DB project-ref match, HTTPS hosted origin, and mandatory admin MFA state', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'padelhub-staging-cli-'));
  try {
    const baseEnv = {
      PADELHUB_SUPABASE_URL: 'https://stagingref1234.supabase.co',
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_valid',
      PADELHUB_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_valid',
      PADELHUB_APP_ORIGIN: 'https://staging.padelhub.example',
    };

    // 1. All migration/repair modes must reject mismatched Supabase project refs before running Supabase CLI.
    for (const mode of ['migrate', 'migrate-dry-run', 'repair-006']) {
      const res = runStagingCli(
        mode,
        {
          ...baseEnv,
          PADELHUB_STAGING_DB_URL: `postgresql://postgres.prodref9999:${CANARY_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
        },
        dir,
      );
      assert.notEqual(res.status, 0, `${mode} must exit non-zero on project-ref mismatch`);
      assert.match(res.stderr, /does not match PADELHUB_SUPABASE_URL project "stagingref1234"/);
      assert.equal(res.stderr.includes(CANARY_DB_PASSWORD), false, `${mode} stderr must not leak DB password`);
      assert.equal(res.stdout.includes(CANARY_DB_PASSWORD), false, `${mode} stdout must not leak DB password`);
    }

    // 2. Non-HTTPS remote PADELHUB_APP_ORIGIN must be rejected at CLI startup.
    const insecureOriginRes = runStagingCli(
      'smoke',
      {
        ...baseEnv,
        PADELHUB_APP_ORIGIN: 'http://staging.padelhub.example',
      },
      dir,
    );
    assert.notEqual(insecureOriginRes.status, 0, 'smoke must reject non-HTTPS hosted origin');
    assert.match(insecureOriginRes.stderr, /must use https:\/\/ for non-loopback hosts/);

    // 3. Full staging smoke must fail fast (non-zero) if admin MFA state is missing — never skip and exit 0.
    const missingAdminRes = runStagingCli('smoke', baseEnv, dir);
    assert.notEqual(missingAdminRes.status, 0, 'smoke must exit non-zero when admin MFA state is missing');
    assert.match(missingAdminRes.stderr, /Full staging smoke requires admin MFA verification/);
    assert.equal(missingAdminRes.stdout.includes('SKIP:'), false, 'smoke must never print SKIP for admin MFA');

    // 4. verify-revoked-admin must fail if MFA enrollment/browser session state is missing.
    mkdirSync(resolve(dir, '.cache'), { recursive: true });
    writeFileSync(
      resolve(dir, '.cache', 'staging-admin-smoke.json'),
      JSON.stringify({
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'admin@example.test',
        password: 'StrongSmokePassword!1',
      }),
      'utf8',
    );
    const missingMfaStateRes = runStagingCli('verify-revoked-admin', baseEnv, dir);
    assert.notEqual(missingMfaStateRes.status, 0, 'verify-revoked-admin must reject incomplete MFA state');
    assert.match(missingMfaStateRes.stderr, /missing MFA enrollment\/browser session state/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
