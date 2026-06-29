import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Outlook template copy fallback selects the source text when clipboard access is blocked', async () => {
  const appSource = await readFile('src/ui/app.js', 'utf8');

  assert.match(appSource, /navigator\.clipboard\?\.writeText/);
  assert.match(appSource, /savedMailTemplates/);
  assert.match(appSource, /data-action="save-template"/);
  assert.match(appSource, /savedMailTemplates\.get/);
  assert.match(appSource, /source\.select\(\)/);
  assert.match(appSource, /선택된 문안을 복사해서 Outlook에 붙여넣으세요/);
});
