// Practical, zero-dependency operator backup & recovery verification helper.
// - Never deletes live user media or resets target databases.
// - Never prints secret credentials or database URIs.
// Usage:
//   node scripts/backup-supabase.mjs media-backup [--local|--staging] [--out <dir>]
//   node scripts/backup-supabase.mjs media-verify --dir <dir>
//   node scripts/backup-supabase.mjs db-drill-local [--out <dir>]
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadStagingEnv, requireHostedStagingConfig } from './staging-env.mjs';

const VALID_MODES = ['media-backup', 'media-verify', 'db-drill-local'];
const BUCKET = 'media-private';
const LOCAL_DB_CONTAINER = 'supabase_db_padelhub-local';

function argValue(flag) {
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return null;
}

function hasFlag(flag) {
  return process.argv.slice(3).includes(flag);
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function resolveSupabaseTarget() {
  if (hasFlag('--local')) {
    const raw = execFileSync(
      process.execPath,
      ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'env'],
      { encoding: 'utf8', windowsHide: true },
    );
    const parsed = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) parsed[m[1]] = m[2].replace(/^"|"$/g, '');
    }
    const url = parsed.API_URL;
    const serviceKey = parsed.SERVICE_ROLE_KEY || parsed.SECRET_KEY;
    if (!url || !serviceKey) {
      throw new Error('Local Supabase is not running or status did not return API_URL / SERVICE_ROLE_KEY.');
    }
    return { label: 'local', url, serviceKey };
  }

  // Default / --staging: load .env.staging.local or process.env (supports production env vars when set explicitly).
  const env = hasFlag('--staging') ? loadStagingEnv() : { ...loadStagingEnv(), ...process.env };
  if (hasFlag('--staging')) {
    const cfg = requireHostedStagingConfig(env);
    return { label: `staging:${cfg.projectRef}`, url: cfg.supabaseUrl, serviceKey: cfg.serviceRoleKey };
  }
  const url = env.PADELHUB_SUPABASE_URL?.trim();
  const serviceKey = env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error('Provide --local, --staging, or set PADELHUB_SUPABASE_URL and PADELHUB_SUPABASE_SERVICE_ROLE_KEY.');
  }
  return { label: new URL(url).hostname, url, serviceKey };
}

async function listBucketFiles(client, prefix = '') {
  const files = [];
  const queue = [prefix];
  while (queue.length > 0) {
    const current = queue.shift();
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage
        .from(BUCKET)
        .list(current, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) {
        throw new Error(`Storage list failed at "${current}": ${error.message}`);
      }
      if (!data || data.length === 0) break;
      for (const entry of data) {
        const fullPath = current ? `${current}/${entry.name}` : entry.name;
        if (entry.id === null) {
          queue.push(fullPath);
        } else {
          files.push({
            path: fullPath,
            size: Number(entry.metadata?.size ?? 0),
            updatedAt: entry.updated_at ?? null,
          });
        }
      }
      if (data.length < 100) break;
      offset += data.length;
    }
  }
  return files;
}

async function runMediaBackup() {
  const target = resolveSupabaseTarget();
  const outDir = resolve(
    process.cwd(),
    argValue('--out') || join('.cache', 'backups', `media-${timestampSlug()}`),
  );
  mkdirSync(outDir, { recursive: true });

  const client = createClient(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const objects = await listBucketFiles(client);
  const manifestEntries = [];
  let totalBytes = 0;

  for (const obj of objects) {
    const { data, error } = await client.storage.from(BUCKET).download(obj.path);
    if (error || !data) {
      throw new Error(`Failed downloading "${obj.path}": ${error?.message ?? 'empty body'}`);
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    const localPath = join(outDir, 'objects', ...obj.path.split('/'));
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, bytes);
    const hash = sha256Hex(bytes);
    totalBytes += bytes.length;
    manifestEntries.push({
      path: obj.path,
      bytes: bytes.length,
      sha256: hash,
      updatedAt: obj.updatedAt,
    });
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    target: target.label,
    bucket: BUCKET,
    objectCount: manifestEntries.length,
    totalBytes,
    objects: manifestEntries,
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify({
      ok: true,
      mode: 'media-backup',
      target: target.label,
      outDir,
      objectCount: manifestEntries.length,
      totalBytes,
    }),
  );
}

function runMediaVerify() {
  const dirArg = argValue('--dir');
  if (!dirArg) {
    throw new Error('media-verify requires --dir <backup-directory>.');
  }
  const backupDir = resolve(process.cwd(), dirArg);
  const manifestPath = join(backupDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${backupDir}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let verifiedBytes = 0;

  for (const entry of manifest.objects ?? []) {
    const filePath = join(backupDir, 'objects', ...String(entry.path).split('/'));
    if (!existsSync(filePath)) {
      throw new Error(`Missing backed-up object: ${entry.path}`);
    }
    const bytes = readFileSync(filePath);
    if (bytes.length !== entry.bytes) {
      throw new Error(`Size mismatch for ${entry.path}: expected ${entry.bytes}, got ${bytes.length}`);
    }
    const actualHash = sha256Hex(bytes);
    if (actualHash !== entry.sha256) {
      throw new Error(`SHA-256 mismatch for ${entry.path}`);
    }
    verifiedBytes += bytes.length;
  }

  console.log(
    JSON.stringify({
      ok: true,
      mode: 'media-verify',
      dir: backupDir,
      verifiedObjects: (manifest.objects ?? []).length,
      verifiedBytes,
    }),
  );
}

function dockerExec(args, options = {}) {
  const res = spawnSync('docker', ['exec', ...args], {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`docker exec failed (${res.status}): ${(res.stderr || '').toString().trim()}`);
  }
  return res.stdout;
}

function runLocalDbRestoreDrill() {
  const outDir = resolve(
    process.cwd(),
    argValue('--out') || join('.cache', 'backups', `db-drill-${timestampSlug()}`),
  );
  mkdirSync(outDir, { recursive: true });
  const dumpFile = join(outDir, 'padelhub-public-private.dump');
  const scratchDb = `padelhub_restore_drill_${Date.now()}`;

  // 1. Capture baseline table & row counts from local Postgres (auth + public + private schemas).
  const countQuery = `
    SELECT json_build_object(
      'tables', (SELECT count(*) FROM pg_tables WHERE schemaname IN ('public', 'private')),
      'force_rls', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname IN ('public', 'private') AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity),
      'auth_users', (SELECT count(*) FROM auth.users),
      'governorates', (SELECT count(*) FROM public.egypt_governorates),
      'brands', (SELECT count(*) FROM public.curated_brands),
      'profiles', (SELECT count(*) FROM public.seller_profiles),
      'listings', (SELECT count(*) FROM public.listings),
      'media_assets', (SELECT count(*) FROM public.media_assets)
    )::text;
  `;
  const sourceStats = JSON.parse(
    dockerExec([LOCAL_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', countQuery]).trim(),
  );

  const permissionsQuery = readFileSync(new URL('../supabase/tests/recovery-permissions.sql', import.meta.url), 'utf8');
  const sourcePermissions = dockerExec([LOCAL_DB_CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', permissionsQuery]).trim();

  // 2. Logical pg_dump (-Fc) of auth, public, and private schemas (cleanly portable to a fresh Supabase DB).
  const dumpBytes = dockerExec(
    [
      LOCAL_DB_CONTAINER,
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Fc',
      '--schema=auth',
      '--schema=public',
      '--schema=private',
    ],
    { encoding: 'buffer' },
  );
  writeFileSync(dumpFile, dumpBytes);
  const dumpSha256 = sha256Hex(dumpBytes);

  // 3. Restore into a completely isolated disposable database inside the local container.
  try {
    dockerExec([LOCAL_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', `CREATE DATABASE ${scratchDb};`]);
    // Pre-create standard Supabase extensions schema that exists on any fresh Supabase project.
    dockerExec([
      LOCAL_DB_CONTAINER,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      scratchDb,
      '-c',
      'DROP SCHEMA public; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;',
    ]);
    const copyRes = spawnSync('docker', ['cp', dumpFile, `${LOCAL_DB_CONTAINER}:/tmp/${scratchDb}.dump`], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (copyRes.status !== 0) {
      throw new Error(`docker cp failed: ${copyRes.stderr}`);
    }
    const restoreRes = spawnSync(
      'docker',
      [
        'exec',
        LOCAL_DB_CONTAINER,
        'pg_restore',
        '-U',
        'supabase_admin',
        '-d',
        scratchDb,
        '--exit-on-error',
        '--single-transaction',
        `/tmp/${scratchDb}.dump`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );

    if (restoreRes.error || restoreRes.status !== 0) {
      throw new Error(restoreRes.error?.message || `pg_restore failed (${restoreRes.status}): ${restoreRes.stderr}`);
    }
    const restoredStats = JSON.parse(
      dockerExec([LOCAL_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', scratchDb, '-tA', '-c', countQuery]).trim(),
    );

    for (const key of Object.keys(sourceStats)) {
      if (sourceStats[key] !== restoredStats[key]) {
        throw new Error(
          `Restore verification mismatch for "${key}": source=${sourceStats[key]} restored=${restoredStats[key]}\npg_restore stderr: ${(restoreRes.stderr || '').slice(0, 600)}`,
        );
      }
    }

    // pg_dump assumes initdb's PUBLIC USAGE on the public schema; restore that
    // baseline explicitly only when the source actually grants it.
    const sourcePublicUsage = dockerExec([LOCAL_DB_CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', "select has_schema_privilege('public','public','USAGE')"]).trim() === 't';
    dockerExec([LOCAL_DB_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', scratchDb, '-c', sourcePublicUsage ? 'grant usage on schema public to public' : 'revoke usage on schema public from public']);
    const restoredPermissions = dockerExec([LOCAL_DB_CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', scratchDb, '-tA', '-c', permissionsQuery]).trim();
    if (sourcePermissions !== restoredPermissions) {
      writeFileSync(join(outDir, 'source-permissions.json'), JSON.stringify(JSON.parse(sourcePermissions), null, 2));
      writeFileSync(join(outDir, 'restored-permissions.json'), JSON.stringify(JSON.parse(restoredPermissions), null, 2));
      throw new Error(`Restored ownership, grants, policies or capability roles differ from source; inspect ${outDir}`);
    }
    // Reuse rollback-only authorization regression fixtures against the actual restore.
    let authorizationAssertions = 0;
    for (const test of ['recovery-authorization.test.sql']) {
      const input = readFileSync(new URL(`../supabase/tests/${test}`, import.meta.url), 'utf8');
      const result = spawnSync('docker', ['exec', '-i', LOCAL_DB_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', scratchDb], {input, encoding: 'utf8', windowsHide: true});
      const passed = [...(result.stdout || '').matchAll(/^\s*ok \d+\b/gm)].length;
      const planned = Number(result.stdout?.match(/^\s*1\.\.(\d+)/m)?.[1]);
      if (result.error || result.status !== 0 || !planned || passed !== planned || /^\s*not ok /m.test(result.stdout)) {
        throw new Error(`Restored authorization failed: ${test}\n${result.stderr}\n${result.stdout}`);
      }
      authorizationAssertions += passed;
    }
    // Also exercise the hosted-style reconstruction: vendor schema + repository
    // migrations + archive data, rather than relying on restored function owners.
    const scratchSql = (input, user = 'postgres') => {
      const result = spawnSync('docker', ['exec', '-i', LOCAL_DB_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', scratchDb], {input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024});
      if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
      return result.stdout;
    };
    const vendorSchema = dockerExec([LOCAL_DB_CONTAINER, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=auth'])
      .replace(/^CREATE POLICY (?:profile_writer_identity|listing_writer_identity|review_writer_identity) ON auth\.users\b[\s\S]*?;\r?\n/gm, '');
    scratchSql('DROP SCHEMA private CASCADE; DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; CREATE SCHEMA public AUTHORIZATION pg_database_owner; GRANT USAGE ON SCHEMA public TO PUBLIC;', 'supabase_admin');
    scratchSql(vendorSchema, 'supabase_admin');
    // A fresh Supabase project also supplies public-schema grants/default ACLs.
    // Recreate that vendor baseline from the archive before running migrations.
    const baselineList = dockerExec([LOCAL_DB_CONTAINER, 'pg_restore', '--list', `/tmp/${scratchDb}.dump`])
      .split('\n').filter(line => / ACL - SCHEMA public | DEFAULT ACL public /.test(line)).join('\n');
    const baselineFile = join(outDir, 'platform-baseline.list');
    writeFileSync(baselineFile, baselineList);
    execFileSync('docker', ['cp', baselineFile, `${LOCAL_DB_CONTAINER}:/tmp/${scratchDb}.baseline`], {windowsHide: true});
    scratchSql(dockerExec([LOCAL_DB_CONTAINER, 'pg_restore', '--schema-only', `--use-list=/tmp/${scratchDb}.baseline`, '--file=-', `/tmp/${scratchDb}.dump`]), 'supabase_admin');
    const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
    for (const migration of readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()) {
      scratchSql(readFileSync(new URL(migration, migrationsDir), 'utf8'));
    }
    const restoreList = dockerExec([LOCAL_DB_CONTAINER, 'pg_restore', '--list', `/tmp/${scratchDb}.dump`])
      .split('\n').filter(line => !/ TABLE DATA auth schema_migrations /.test(line)).join('\n');
    const listFile = join(outDir, 'restore.list');
    writeFileSync(listFile, restoreList);
    execFileSync('docker', ['cp', listFile, `${LOCAL_DB_CONTAINER}:/tmp/${scratchDb}.list`], {windowsHide: true});
    const restoreData = dockerExec([LOCAL_DB_CONTAINER, 'pg_restore', '--data-only', `--use-list=/tmp/${scratchDb}.list`, '--file=-', `/tmp/${scratchDb}.dump`]);
    scratchSql(`BEGIN; SET LOCAL session_replication_role = replica;
      DELETE FROM public.username_registry; DELETE FROM public.curated_brands;
      DELETE FROM public.egypt_governorates; DELETE FROM public.platform_settings;
      ${restoreData}\nCOMMIT;`);
    const rebuiltPermissions = dockerExec([LOCAL_DB_CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', scratchDb, '-tA', '-c', permissionsQuery]).trim();
    if (sourcePermissions !== rebuiltPermissions) {
      writeFileSync(join(outDir, 'source-permissions.json'), JSON.stringify(JSON.parse(sourcePermissions), null, 2));
      writeFileSync(join(outDir, 'rebuilt-permissions.json'), JSON.stringify(JSON.parse(rebuiltPermissions), null, 2));
      throw new Error('Migration-reconstructed permissions differ from source');
    }
    const rebuiltStats = JSON.parse(dockerExec([LOCAL_DB_CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', scratchDb, '-tA', '-c', countQuery]).trim());
    if (JSON.stringify(sourceStats) !== JSON.stringify(rebuiltStats)) throw new Error('Migration-reconstructed row counts differ from source');
    const authorization = scratchSql(readFileSync(new URL('../supabase/tests/recovery-authorization.test.sql', import.meta.url), 'utf8'));
    const reconstructedAssertions = [...authorization.matchAll(/^\s*ok \d+\b/gm)].length;
    if (reconstructedAssertions !== 12 || /^\s*not ok /m.test(authorization)) throw new Error(`Reconstructed authorization failed: ${authorization}`);
    console.log(
      JSON.stringify({
        ok: true,
        mode: 'db-drill-local',
        permissionCatalogParity: true,
        authorizationAssertions,
        migrationReconstructionParity: true,
        reconstructedAssertions,
        dumpFile,
        dumpBytes: dumpBytes.length,
        dumpSha256,
        sourceStats,
        restoredStats,
      }),
    );
  } finally {
    spawnSync(
      'docker',
      ['exec', LOCAL_DB_CONTAINER, 'rm', '-f', `/tmp/${scratchDb}.dump`, `/tmp/${scratchDb}.list`, `/tmp/${scratchDb}.baseline`],
      { windowsHide: true },
    );
    spawnSync(
      'docker',
      [
        'exec',
        LOCAL_DB_CONTAINER,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        `DROP DATABASE IF EXISTS ${scratchDb} WITH (FORCE);`,
      ],
      { windowsHide: true },
    );
  }
}

const mode = process.argv[2];
if (!VALID_MODES.includes(mode)) {
  console.error(`Usage: node scripts/backup-supabase.mjs <${VALID_MODES.join('|')}>`);
  process.exit(1);
}

try {
  if (mode === 'media-backup') {
    await runMediaBackup();
  } else if (mode === 'media-verify') {
    runMediaVerify();
  } else if (mode === 'db-drill-local') {
    runLocalDbRestoreDrill();
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
