import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createPlatformStore } from '../../src/app/platform-store.js';
import { createSeedData } from '../../src/app/seed-data.js';

test('store supports publish, proposal submission, evaluation, award, and supplier result view', () => {
  const store = createPlatformStore(createSeedData());

  const draft = store.createNotice('member-buyer-1', {
    id: 'notice-new',
    title: 'Mobile App Build',
    category: 'IT',
    summary: 'Build a customer app.',
    requirements: 'iOS and Android MVP.',
    budgetMin: 10000000,
    budgetMax: 20000000,
    deadlineAt: '2026-07-10T00:00:00.000Z',
    evaluationCriteria: 'Price 40, technical 40, schedule 20',
    attachmentRequirements: ['Company profile'],
  });
  const published = store.publishNotice('member-buyer-1', draft.id, '2026-06-22T00:00:00.000Z');
  const proposal = store.submitProposal('member-supplier-1', published.id, {
    id: 'proposal-new',
    price: 15000000,
    deliverySchedule: '60 days',
    proposalText: 'We will deliver native apps.',
  }, '2026-06-23T00:00:00.000Z');

  store.closeNotice(published.id, '2026-07-11T00:00:00.000Z');
  store.startEvaluation('member-buyer-1', published.id, '2026-07-11T01:00:00.000Z');
  store.recordEvaluation('member-buyer-1', proposal.id, { priceScore: 35, technicalScore: 40, scheduleScore: 18, note: 'Best fit' }, '2026-07-11T02:00:00.000Z');
  const award = store.awardNotice('member-buyer-1', published.id, proposal.id, 'Best score and realistic schedule.', '2026-07-11T03:00:00.000Z');
  const saved = store.saveNotice('member-supplier-1', 'notice-seed-1');
  const hidden = store.hideNotice('member-operator-1', 'notice-seed-1', 'Operator review requested.', '2026-07-11T04:00:00.000Z');
  const restored = store.restoreNotice('member-operator-1', 'notice-seed-1', '2026-07-11T05:00:00.000Z');

  assert.equal(award.notice.status, NoticeStatus.Awarded);
  assert.equal(store.getProposalForSupplier('member-supplier-1', proposal.id).status, ProposalStatus.Selected);
  assert.equal(saved.noticeId, 'notice-seed-1');
  assert.equal(store.listSavedNotices('member-supplier-1').length, 1);
  assert.equal(hidden.notice.status, NoticeStatus.Hidden);
  assert.equal(restored.notice.status, NoticeStatus.Published);
  assert.ok(store.listActivity().length >= 4);
});
