import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('project declares module mode and a node test command', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs tests/**/*.test.mjs');
});

test('project declares a local preview server command', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const server = await readFile('scripts/start-server.mjs', 'utf8');

  assert.equal(pkg.scripts.start, 'node scripts/start-server.mjs');
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /EPERM/);
  assert.match(server, /Codex 샌드박스/);
  assert.match(server, /PORT=4174 npm start/);
  assert.match(server, /lsof -nP -iTCP:4173/);
});

test('index shell exposes an app root and module entrypoint', async () => {
  const html = await readFile('index.html', 'utf8');

  assert.match(html, /id="app"/);
  assert.match(html, /src="\.\/src\/main\.js"/);
  assert.match(html, /입찰 플랫폼 MVP/);
  assert.match(html, /입찰 플랫폼을 불러오는 중입니다/);
});

test('browser entrypoint imports the app bootstrap', async () => {
  const main = await readFile('src/main.js', 'utf8');

  assert.match(main, /bootBidPlatformApp/);
});
