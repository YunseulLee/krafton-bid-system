import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeedData } from '../../src/app/seed-data.js';
import { createPlatformStore } from '../../src/app/platform-store.js';
import { renderDashboard } from '../../src/ui/render.js';

test('buyer dashboard renders notice management and proposal comparison areas', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({ state: store.snapshot(), memberId: 'member-buyer-1' });

  assert.match(html, /Buyer Portal/);
  assert.match(html, /Bid Notices/);
  assert.match(html, /Proposal Comparison/);
});

test('supplier dashboard renders discovery and submission areas', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({ state: store.snapshot(), memberId: 'member-supplier-1' });

  assert.match(html, /Supplier Portal/);
  assert.match(html, /Public Bid Discovery/);
  assert.match(html, /Saved Notices/);
  assert.match(html, /My Proposals/);
});

test('operator dashboard renders moderation areas', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({ state: store.snapshot(), memberId: 'member-operator-1' });

  assert.match(html, /Operator Console/);
  assert.match(html, /Company Review/);
  assert.match(html, /Notice Moderation/);
});
