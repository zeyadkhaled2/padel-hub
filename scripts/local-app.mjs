// Local-only setup/launcher. Credentials stay in memory and never enter output.
import { execFileSync, spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const status = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname)) throw new Error('Local Supabase required');
const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = await client.storage.getBucket('media-private');
if (!bucket.data) {
  const created = await client.storage.createBucket('media-private', { public: false, fileSizeLimit: 8388608, allowedMimeTypes: ['image/webp'] });
  if (created.error) throw new Error('Cannot prepare local photo bucket');
} else if (bucket.data.public) throw new Error('Photo bucket must remain private');
const env = { ...process.env, PADELHUB_SUPABASE_URL: status.API_URL,
  PADELHUB_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
  PADELHUB_SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  PADELHUB_APP_ORIGIN: 'http://127.0.0.1:3100', PADELHUB_AUTH_E2E: '1', PLAYWRIGHT_CHANNEL: 'chrome' };
const mode = process.argv[2] || 'serve';
if (mode === 'setup') { console.log('Local private photo bucket ready.'); }
else {
  const args = mode === 'test' ? ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(3)] : ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'];
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
  child.on('exit', code => process.exit(code ?? 1));
}
