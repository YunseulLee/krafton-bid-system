import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('project declares module mode and a node test command', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs tests/**/*.test.mjs');
});

test('index shell exposes an app root and module entrypoint', async () => {
  const html = await readFile('index.html', 'utf8');

  assert.match(html, /id="app"/);
  assert.match(html, /src="\.\/src\/main\.js"/);
});

test('browser entrypoint imports the app bootstrap', async () => {
  const main = await readFile('src/main.js', 'utf8');

  assert.match(main, /bootBidPlatformApp/);
});
