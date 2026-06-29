import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, ProposalStatus } from '../../src/domain/constants.js';
import { createCompany, createProposal } from '../../src/domain/model.js';
import { createSeedData } from '../../src/app/seed-data.js';
import { createPlatformStore } from '../../src/app/platform-store.js';

const operatorId = 'member-operator-1';
const participantId = 'member-supplier-1';

function seedWithSecondSubmission() {
  const seed = createSeedData();
  seed.companies.push(createCompany({
    id: 'company-supplier-2',
    name: '부산제안파트너스',
    businessRegistrationNumber: '202-81-00003',
    type: CompanyType.Supplier,
    status: CompanyStatus.Approved,
    contactName: '박제안',
    contactEmail: 'supplier2@example.com',
  }));
  seed.proposals.push(createProposal({
    id: 'proposal-ended-2',
    bidNoticeId: 'notice-ended-1',
    supplierCompanyId: 'company-supplier-2',
    price: null,
    deliverySchedule: '',
    proposalText: '제안서 파일로 제출했습니다.',
    file: {
      name: '부산파트너스_제안서.pdf',
      size: 428000,
      type: 'application/pdf',
    },
    status: ProposalStatus.Submitted,
    submittedAt: '2026-06-05T11:00:00.000Z',
  }));
  return seed;
}

function evaluateAllSubmissions(store) {
  store.evaluateSubmission(operatorId, 'proposal-ended-1', {
    score: 91,
    note: '수행 계획이 구체적입니다.',
  }, '2026-06-25T09:30:00.000Z');
  store.evaluateSubmission(operatorId, 'proposal-ended-2', {
    score: 84,
    note: '일정 계획을 확인했습니다.',
  }, '2026-06-25T09:35:00.000Z');
}

test('operator selects one preferred supplier and marks the rest as rejected', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  evaluateAllSubmissions(store);

  const result = store.selectPreferredProposal(operatorId, 'proposal-ended-1', '2026-06-25T10:00:00.000Z');

  assert.equal(result.selectedProposal.status, ProposalStatus.Selected);
  assert.equal(result.rejectedProposals.length, 1);
  assert.equal(result.rejectedProposals[0].status, ProposalStatus.NotSelected);
});

test('operator cannot select preferred supplier before every submitted proposal is evaluated', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  store.evaluateSubmission(operatorId, 'proposal-ended-1', {
    score: 91,
    note: '첫 번째 제출 건만 평가했습니다.',
  }, '2026-06-25T09:30:00.000Z');

  assert.throws(
    () => store.selectPreferredProposal(operatorId, 'proposal-ended-1', '2026-06-25T10:00:00.000Z'),
    { code: 'EVALUATION_REQUIRED_BEFORE_SELECTION' }
  );
});

test('only operators can select preferred suppliers and complete Outlook result notification', () => {
  const store = createPlatformStore(seedWithSecondSubmission());

  assert.throws(
    () => store.selectPreferredProposal(participantId, 'proposal-ended-1', '2026-06-25T10:00:00.000Z'),
    { code: 'ONLY_OPERATORS_SELECT_RESULTS' }
  );

  evaluateAllSubmissions(store);
  store.selectPreferredProposal(operatorId, 'proposal-ended-1', '2026-06-25T10:00:00.000Z');
  const notice = store.markResultNotificationComplete(operatorId, 'notice-ended-1', '2026-06-25T11:00:00.000Z');

  assert.equal(notice.resultNotifiedAt, '2026-06-25T11:00:00.000Z');
});

test('operator cannot change preferred supplier after Outlook result notification is complete', () => {
  const store = createPlatformStore(seedWithSecondSubmission());

  evaluateAllSubmissions(store);
  store.selectPreferredProposal(operatorId, 'proposal-ended-1', '2026-06-25T10:00:00.000Z');
  store.markResultNotificationComplete(operatorId, 'notice-ended-1', '2026-06-25T11:00:00.000Z');

  assert.throws(
    () => store.selectPreferredProposal(operatorId, 'proposal-ended-2', '2026-06-25T12:00:00.000Z'),
    { code: 'RESULT_NOTIFICATION_ALREADY_COMPLETE' }
  );
});

test('operator cannot change evaluation after Outlook result notification is complete', () => {
  const store = createPlatformStore(seedWithSecondSubmission());

  store.evaluateSubmission(operatorId, 'proposal-ended-1', {
    score: 91,
    note: '통보 전 평가입니다.',
  }, '2026-06-25T09:30:00.000Z');
  store.evaluateSubmission(operatorId, 'proposal-ended-2', {
    score: 84,
    note: '두 번째 제출 건도 평가했습니다.',
  }, '2026-06-25T09:35:00.000Z');
  store.selectPreferredProposal(operatorId, 'proposal-ended-1', '2026-06-25T10:00:00.000Z');
  store.markResultNotificationComplete(operatorId, 'notice-ended-1', '2026-06-25T11:00:00.000Z');

  assert.throws(
    () => store.evaluateSubmission(operatorId, 'proposal-ended-1', {
      score: 80,
      note: '통보 후 수정 시도입니다.',
    }, '2026-06-25T12:00:00.000Z'),
    { code: 'RESULT_NOTIFICATION_ALREADY_COMPLETE' }
  );
});
