// Practical, zero-dependency operator backup & recovery verification helper.
// - Never deletes live user media or resets target databases.
// - Never prints secret credentials or database URIs.
// Usage:
//   node scripts/backup-supabase.mjs media-backup [--local|--staging] [--out <dir>]
//   node scripts/backup-supabase.mjs media-verify --dir <dir>
//   node scripts/backup-supabase.mjs db-drill-local [--out <dir>]
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
      '--no-owner',
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
      'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;',
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
        'postgres',
        '-d',
        scratchDb,
        '--no-owner',
        '--no-privileges',
        `/tmp/${scratchDb}.dump`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );

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

    console.log(
      JSON.stringify({
        ok: true,
        mode: 'db-drill-local',
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
      ['exec', LOCAL_DB_CONTAINER, 'rm', '-f', `/tmp/${scratchDb}.dump`],
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
