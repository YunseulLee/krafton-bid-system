import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('browser app does not treat a blank evaluation score as zero', async () => {
  const appSource = await readFile('src/ui/app.js', 'utf8');

  assert.match(appSource, /scoreValue\.trim\(\) === '' \? Number\.NaN : Number\(scoreValue\)/);
  assert.doesNotMatch(appSource, /const score = Number\(root\.querySelector\(`\\\[data-evaluation-score="\$\{proposalId\}"\\\]`\)\?\.value\)/);
});
