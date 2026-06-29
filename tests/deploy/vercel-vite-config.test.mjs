import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('package declares Vite build scripts and Supabase dependency metadata', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(pkg.scripts.dev, 'vite --host 127.0.0.1');
  assert.equal(pkg.scripts.start, 'node scripts/start-server.mjs');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts.preview, 'vite preview --host 127.0.0.1');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs tests/**/*.test.mjs');
  assert.match(pkg.dependencies['@supabase/supabase-js'], /^\^/);
  assert.match(pkg.devDependencies.vite, /^\^/);
});

test('Vite config uses the local browser preview host and port', async () => {
  const config = await readFile('vite.config.js', 'utf8');

  assert.match(config, /defineConfig/);
  assert.match(config, /server:\s*{/);
  assert.match(config, /preview:\s*{/);
  assert.match(config, /host:\s*'127\.0\.0\.1'/);
  assert.match(config, /port:\s*4173/);
});

test('start command points to an available local preview server script', async () => {
  const server = await readFile('scripts/start-server.mjs', 'utf8');

  assert.match(server, /createServer/);
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /입찰 플랫폼 미리보기/);
});

test('Vercel routes browser refreshes to the Vite app shell', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));

  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});

test('environment example documents only public Supabase browser variables', async () => {
  const env = await readFile('.env.example', 'utf8');

  assert.match(env, /VITE_SUPABASE_URL=/);
  assert.match(env, /VITE_SUPABASE_ANON_KEY=/);
  assert.doesNotMatch(env, /SERVICE_ROLE|SECRET|PRIVATE/);
});

test('deployment runbook covers Supabase, Vercel, Outlook, and manual acceptance', async () => {
  const runbook = await readFile('docs/deployment/supabase-vercel.md', 'utf8');

  assert.match(runbook, /Supabase/);
  assert.match(runbook, /Vercel/);
  assert.match(runbook, /Outlook/);
  assert.match(runbook, /입찰중/);
  assert.match(runbook, /notification complete/);
  assert.match(runbook, /no score, note, preferred\/rejected status, or proposal download link/);
});
