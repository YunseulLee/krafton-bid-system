import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoticeStatus } from '../../src/domain/constants.js';
import { createSeedData } from '../../src/app/seed-data.js';
import { createPlatformStore } from '../../src/app/platform-store.js';

const operatorId = 'member-operator-1';
const participantId = 'member-supplier-1';

test('operator creates a published notice with an open period', () => {
  const store = createPlatformStore(createSeedData());

  const notice = store.createOperatorNotice(operatorId, {
    id: 'notice-operator-new',
    title: '본사 보안 장비 교체',
    category: '시설관리',
    summary: '본사 출입 보안 장비를 교체합니다.',
    requirements: '설치 계획과 유지보수 방안을 포함해 제출해 주세요.',
    startsAt: '2026-06-22T00:00:00.000Z',
    deadlineAt: '2026-07-01T18:00:00.000Z',
    requestFile: {
      name: '보안장비_제안요청서.pdf',
      size: 380000,
      type: 'application/pdf',
      lastModified: 1782100000000,
    },
  }, '2026-06-22T09:00:00.000Z');

  assert.equal(notice.status, NoticeStatus.Published);
  assert.equal(notice.createdByMemberId, operatorId);
  assert.equal(notice.startsAt, '2026-06-22T00:00:00.000Z');
  assert.equal(notice.requestFile.name, '보안장비_제안요청서.pdf');
  assert.equal(notice.requestFile.type, 'application/pdf');
});

test('operator notice creation requires title, category, and summary', () => {
  const store = createPlatformStore(createSeedData());
  const requiredInput = {
    id: 'notice-operator-new',
    title: '본사 보안 장비 교체',
    category: '시설관리',
    summary: '본사 출입 보안 장비를 교체합니다.',
    requirements: '설치 계획과 유지보수 방안을 포함해 제출해 주세요.',
    startsAt: '2026-06-22T00:00:00.000Z',
    deadlineAt: '2026-07-01T18:00:00.000Z',
    requestFile: {
      name: '보안장비_제안요청서.pdf',
      size: 380000,
      type: 'application/pdf',
    },
  };

  for (const field of ['title', 'category', 'summary']) {
    assert.throws(
      () => store.createOperatorNotice(operatorId, {
        ...requiredInput,
        id: `notice-blank-${field}`,
        [field]: '   ',
      }, '2026-06-22T09:00:00.000Z'),
      /공고명, 분야, 설명을 모두 입력하세요\./
    );
  }
});

test('participant submits a proposal file while the notice is open', () => {
  const store = createPlatformStore(createSeedData());

  const proposal = store.submitProposalFile(participantId, 'notice-seed-1', {
    name: '제안서.pdf',
    size: 482000,
    type: 'application/pdf',
    lastModified: 1782100000000,
  }, '2026-06-23T09:00:00.000Z');

  assert.equal(proposal.bidNoticeId, 'notice-seed-1');
  assert.equal(proposal.file.name, '제안서.pdf');
  assert.equal(proposal.submittedByMemberId, participantId);
});

test('participant replaces a submitted proposal file before the deadline and keeps replacement history', () => {
  const store = createPlatformStore(createSeedData());

  const first = store.submitProposalFile(participantId, 'notice-seed-1', {
    name: '잘못된_제안서.zip',
    size: 482000,
    type: 'application/zip',
  }, '2026-06-23T09:00:00.000Z');

  const replaced = store.submitProposalFile(participantId, 'notice-seed-1', {
    name: '최종_제안서.zip',
    size: 640000,
    type: 'application/zip',
  }, '2026-06-24T09:00:00.000Z');

  assert.equal(replaced.id, first.id);
  assert.equal(replaced.file.name, '최종_제안서.zip');
  assert.equal(replaced.fileHistory.length, 1);
  assert.equal(replaced.fileHistory[0].name, '잘못된_제안서.zip');
  assert.equal(replaced.fileHistory[0].replacedAt, '2026-06-24T09:00:00.000Z');

  const afterEnd = store.listOperatorSubmissions(operatorId, 'notice-seed-1', '2026-07-06T09:00:00.000Z');
  assert.equal(afterEnd.submissions[0].file.name, '최종_제안서.zip');
});

test('participant cannot replace a proposal file after the deadline', () => {
  const store = createPlatformStore(createSeedData());

  store.submitProposalFile(participantId, 'notice-seed-1', {
    name: '마감전_제안서.zip',
    size: 482000,
    type: 'application/zip',
  }, '2026-06-23T09:00:00.000Z');

  assert.throws(
    () => store.submitProposalFile(participantId, 'notice-seed-1', {
      name: '마감후_교체본.zip',
      size: 640000,
      type: 'application/zip',
    }, '2026-07-06T09:00:00.000Z'),
    /공고 기간 안에만/
  );
});

test('participant cannot submit or replace a proposal file at the exact deadline', () => {
  const store = createPlatformStore(createSeedData());

  assert.throws(
    () => store.submitProposalFile(participantId, 'notice-seed-1', {
      name: '마감정각_제안서.zip',
      size: 640000,
      type: 'application/zip',
    }, '2026-07-05T09:00:00.000Z'),
    /공고 기간 안에만/
  );

  const replaceStore = createPlatformStore(createSeedData());
  replaceStore.submitProposalFile(participantId, 'notice-seed-1', {
    name: '마감전_제안서.zip',
    size: 482000,
    type: 'application/zip',
  }, '2026-06-23T09:00:00.000Z');

  assert.throws(
    () => replaceStore.submitProposalFile(participantId, 'notice-seed-1', {
      name: '마감정각_교체본.zip',
      size: 640000,
      type: 'application/zip',
    }, '2026-07-05T09:00:00.000Z'),
    /공고 기간 안에만/
  );
});

test('operator can inspect submitted files only after the notice period ends and then evaluate', () => {
  const store = createPlatformStore(createSeedData());

  store.submitProposalFile(participantId, 'notice-seed-1', {
    name: '마감전_제안서.pdf',
    size: 256000,
    type: 'application/pdf',
  }, '2026-06-23T09:00:00.000Z');

  const beforeEnd = store.listOperatorSubmissions(operatorId, 'notice-seed-1', '2026-06-25T09:00:00.000Z');
  assert.equal(beforeEnd.canOpenFiles, false);
  assert.equal(beforeEnd.submissions[0].file, null);
  assert.match(beforeEnd.submissions[0].lockedReason, /기간 종료 후/);

  const afterEnd = store.listOperatorSubmissions(operatorId, 'notice-ended-1', '2026-06-25T09:00:00.000Z');
  assert.equal(afterEnd.canOpenFiles, true);
  assert.equal(afterEnd.submissions[0].file.name, '네트워크_제안서.pdf');

  const evaluation = store.evaluateSubmission(operatorId, afterEnd.submissions[0].id, {
    score: 92,
    note: '기간 종료 후 검토한 결과 수행 계획이 구체적입니다.',
  }, '2026-06-25T10:00:00.000Z');

  assert.equal(evaluation.totalScore, 92);
  assert.equal(evaluation.evaluatorMemberId, operatorId);
});
