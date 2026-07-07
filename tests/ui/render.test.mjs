import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, ProposalStatus } from '../../src/domain/constants.js';
import { createCompany, createProposal } from '../../src/domain/model.js';
import { createSeedData } from '../../src/app/seed-data.js';
import { createPlatformStore } from '../../src/app/platform-store.js';
import { renderDashboard } from '../../src/ui/render.js';

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
  store.evaluateSubmission('member-operator-1', 'proposal-ended-1', {
    score: 91,
    note: '수행 계획이 구체적입니다.',
  }, '2026-06-25T09:30:00.000Z');
  store.evaluateSubmission('member-operator-1', 'proposal-ended-2', {
    score: 84,
    note: '일정 계획을 확인했습니다.',
  }, '2026-06-25T09:35:00.000Z');
}

test('participant dashboard starts with bid details and proposal submission flow', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-supplier-1',
    selectedNoticeId: 'notice-seed-1',
    now: '2026-06-22T09:00:00.000Z',
  });

  assert.match(html, /입찰 내용 확인 및 제안/);
  assert.match(html, /입찰목록/);
  assert.match(html, /사무실 네트워크 고도화/);
  assert.match(html, /제안요청서/);
  assert.match(html, /사무실_네트워크_제안요청서\.pdf/);
  assert.match(html, /제안요청서 다운로드/);
  assert.match(html, /제안서 제출/);
  assert.doesNotMatch(html, /제안서 파일 업로드/);
  assert.match(html, /압축 파일로 제안서 파일을 제안하세요/);
  assert.doesNotMatch(html, /PDF, 문서, 압축 파일 등 제안서 파일을 선택해 제출하세요/);
  assert.match(html, /제안서 제출/);
  assert.doesNotMatch(html, /평가 기준/);
});

test('participant dashboard shows the selected proposal file before submission', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-supplier-1',
    selectedNoticeId: 'notice-seed-1',
    selectedProposalFile: {
      name: '서울공급웍스_최종제안서.pdf',
      size: 512000,
      type: 'application/pdf',
    },
    now: '2026-06-22T09:00:00.000Z',
  });

  assert.match(html, /선택된 파일/);
  assert.match(html, /서울공급웍스_최종제안서\.pdf/);
  assert.match(html, /500 KB/);
});

test('participant dashboard allows replacing a submitted file before the deadline', () => {
  const store = createPlatformStore(createSeedData());
  store.submitProposalFile('member-supplier-1', 'notice-seed-1', {
    name: '잘못된_제안서.zip',
    size: 256000,
    type: 'application/zip',
  }, '2026-06-23T09:00:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-supplier-1',
    selectedNoticeId: 'notice-seed-1',
    now: '2026-06-24T09:00:00.000Z',
  });

  assert.match(html, /이미 제출한 제안서/);
  assert.match(html, /잘못된_제안서\.zip/);
  assert.match(html, /마감 전까지 파일을 교체할 수 있습니다/);
  assert.match(html, /data-action="replace-proposal-file"/);
  assert.match(html, /파일 교체/);
});

test('participant dashboard locks file replacement after the deadline', () => {
  const store = createPlatformStore(createSeedData());

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-supplier-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T09:00:00.000Z',
  });

  assert.match(html, /이미 제출한 제안서/);
  assert.match(html, /제출 마감 이후에는 파일을 교체할 수 없습니다/);
  assert.doesNotMatch(html, /data-action="replace-proposal-file"/);
});

test('participant dashboard treats the exact deadline as closed', () => {
  const store = createPlatformStore(createSeedData());
  store.submitProposalFile('member-supplier-1', 'notice-seed-1', {
    name: '마감전_제안서.zip',
    size: 256000,
    type: 'application/zip',
  }, '2026-06-23T09:00:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-supplier-1',
    selectedNoticeId: 'notice-seed-1',
    now: '2026-07-05T09:00:00.000Z',
  });

  assert.match(html, /평가중/);
  assert.match(html, /제출 마감 이후에는 파일을 교체할 수 없습니다/);
  assert.doesNotMatch(html, /data-action="replace-proposal-file"/);
  assert.doesNotMatch(html, /마감 전까지 파일을 교체할 수 있습니다/);
});

test('operator dashboard renders bid list upload and proposal review flow', () => {
  const store = createPlatformStore(createSeedData());
  store.submitProposalFile('member-supplier-1', 'notice-seed-1', {
    name: '마감전_제안서.pdf',
    size: 256000,
    type: 'application/pdf',
  }, '2026-06-23T09:00:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-seed-1',
    now: '2026-06-25T09:00:00.000Z',
  });

  assert.doesNotMatch(html, /운영자 공고 관리/);
  assert.match(html, /입찰목록 업로드/);
  assert.match(html, /제안서 확인 및 검토/);
  assert.ok(html.indexOf('입찰목록 업로드') < html.indexOf('제안요청서 교체'));
  assert.ok(html.indexOf('제안요청서 교체') < html.indexOf('제안서 확인 및 검토'));
  assert.doesNotMatch(html, /새 공고 추가/);
  assert.match(html, /시작일 \(한국시간\)/);
  assert.match(html, /종료일 \(한국시간\)/);
  assert.match(html, /name="title"[^>]*required/);
  assert.match(html, /name="category"[^>]*required/);
  assert.match(html, /name="summary"[^>]*required/);
  assert.match(html, /제안요청서 파일/);
  assert.match(html, /제안요청서 교체/);
  assert.match(html, /입찰 참여자는 최신 제안요청서만 다운로드합니다/);
  assert.match(html, /교체된 원본 파일은 보관 이력으로 남습니다/);
  assert.match(html, /data-action="replace-rfp-file"/);
  assert.match(html, /입찰중/);
  assert.match(html, /Outlook 메일 템플릿/);
  assert.match(html, /\[입찰 안내\] 사무실 네트워크 고도화/);
  assert.match(html, /data-action="save-template"/);
  assert.match(html, /문안 저장/);
  assert.match(html, /수정한 내용은 문안 저장 후 복사에 반영됩니다/);
  assert.doesNotMatch(html, /<input readonly data-copy-source/);
  assert.doesNotMatch(html, /<textarea readonly data-copy-source/);
  assert.match(html, /제목 복사/);
  assert.match(html, /본문 복사/);
  assert.match(html, /공고 기간 종료 후 열람 가능합니다/);
  assert.doesNotMatch(html, /평가 기준/);
});

test('operator notice upload form requires the operator to enter the Korean-time bid period', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-seed-1',
    now: '2026-07-07T00:00:00.000Z',
  });

  assert.match(html, /name="startsAt" type="datetime-local" required/);
  assert.match(html, /name="deadlineAt" type="datetime-local" required/);
  assert.doesNotMatch(html, /name="startsAt" type="datetime-local" value=/);
  assert.doesNotMatch(html, /name="deadlineAt" type="datetime-local" value=/);
  assert.doesNotMatch(html, /defaultNoticePeriod/);
  assert.doesNotMatch(html, /value="2026-06-22T09:00"/);
  assert.doesNotMatch(html, /value="2026-07-05T18:00"/);
});

test('operator dashboard shows submitted files and evaluation controls after the period ends', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T09:00:00.000Z',
  });

  assert.match(html, /완료된 보안 점검 용역/);
  assert.match(html, /네트워크_제안서\.pdf/);
  assert.match(html, /제안서 다운로드/);
  assert.match(html, /평가 점수/);
  assert.match(html, /평가 저장/);
});

test('operator dashboard starts unsaved evaluation fields blank', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T09:00:00.000Z',
  });

  assert.match(html, /data-evaluation-score="proposal-ended-1"[^>]+value=""/);
  assert.match(html, /data-evaluation-note="proposal-ended-1" value=""/);
  assert.doesNotMatch(html, /value="90"|제안서 검토 완료/);
});

test('operator dashboard hides preferred supplier action until every submission is evaluated', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  store.evaluateSubmission('member-operator-1', 'proposal-ended-1', {
    score: 91,
    note: '첫 번째 제출 건만 평가했습니다.',
  }, '2026-06-25T09:30:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T10:00:00.000Z',
  });

  assert.doesNotMatch(html, /data-action="select-preferred"/);
  assert.match(html, /모든 제출 업체의 평가를 저장한 뒤 우선대상자를 선택할 수 있습니다/);
});

test('operator dashboard hides invitation mail template after the notice period ends', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T09:00:00.000Z',
  });

  assert.doesNotMatch(html, /입찰 안내 메일/);
  assert.doesNotMatch(html, /현재 입찰중입니다/);
});

test('operator dashboard keeps saved evaluation score and note visible', () => {
  const store = createPlatformStore(createSeedData());
  store.evaluateSubmission('member-operator-1', 'proposal-ended-1', {
    score: 87,
    note: '도입 일정이 명확합니다.',
  }, '2026-06-25T09:30:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T10:00:00.000Z',
  });

  assert.match(html, /value="87"/);
  assert.match(html, /value="도입 일정이 명확합니다."/);
});

test('operator dashboard shows result mail templates after selecting a preferred supplier', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  evaluateAllSubmissions(store);
  store.selectPreferredProposal('member-operator-1', 'proposal-ended-1', '2026-06-25T10:00:00.000Z');
  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T11:00:00.000Z',
  });

  assert.match(html, /우선대상자 메일 문안/);
  assert.match(html, /탈락자 메일 문안/);
  assert.match(html, /서울공급웍스/);
  assert.match(html, /부산제안파트너스/);
  assert.match(html, /통보 완료/);
});

test('operator dashboard shows notification completion timestamp after Outlook notice is sent', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  evaluateAllSubmissions(store);
  store.selectPreferredProposal('member-operator-1', 'proposal-ended-1', '2026-06-25T10:00:00.000Z');
  store.markResultNotificationComplete('member-operator-1', 'notice-ended-1', '2026-06-25T11:00:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T12:00:00.000Z',
  });

  assert.match(html, /통보 완료됨/);
  assert.match(html, /통보 완료 시각/);
});

test('operator dashboard hides preferred supplier actions after result notification is complete', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  evaluateAllSubmissions(store);
  store.selectPreferredProposal('member-operator-1', 'proposal-ended-1', '2026-06-25T10:00:00.000Z');
  store.markResultNotificationComplete('member-operator-1', 'notice-ended-1', '2026-06-25T11:00:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T12:00:00.000Z',
  });

  assert.doesNotMatch(html, /data-action="select-preferred"/);
  assert.match(html, /결과 통보 완료 후에는 우선대상자를 변경할 수 없습니다/);
});

test('operator dashboard hides evaluation save actions after result notification is complete', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  evaluateAllSubmissions(store);
  store.selectPreferredProposal('member-operator-1', 'proposal-ended-1', '2026-06-25T10:00:00.000Z');
  store.markResultNotificationComplete('member-operator-1', 'notice-ended-1', '2026-06-25T11:00:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-operator-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T12:00:00.000Z',
  });

  assert.doesNotMatch(html, /data-action="save-evaluation"/);
  assert.match(html, /결과 통보 완료 후에는 평가를 수정할 수 없습니다/);
});

test('participant dashboard does not expose evaluation scores or selection results', () => {
  const store = createPlatformStore(seedWithSecondSubmission());
  evaluateAllSubmissions(store);
  store.selectPreferredProposal('member-operator-1', 'proposal-ended-1', '2026-06-25T10:00:00.000Z');

  const html = renderDashboard({
    state: store.snapshot(),
    memberId: 'member-supplier-1',
    selectedNoticeId: 'notice-ended-1',
    now: '2026-06-25T11:00:00.000Z',
  });

  assert.doesNotMatch(html, /평가 점수|평가 메모|92|우선대상자|탈락자|선정|미선정/);
});

test('participant dashboard remains safe with Supabase participant-safe proposal rows', () => {
  const state = {
    members: [{
      id: 'supplier-user',
      name: '참여자',
      role: 'Supplier',
      companyId: 'company-supplier-user',
      companyName: '서울공급웍스',
    }],
    companies: [],
    notices: [{
      id: 'notice-1',
      title: '네트워크 고도화',
      category: '정보기술',
      summary: '요약',
      startsAt: '2026-06-22T09:00:00.000Z',
      deadlineAt: '2026-07-05T09:00:00.000Z',
      status: 'Published',
      requestFile: { name: '요청서.pdf', size: 1024, url: 'https://signed.example/rfp' },
    }],
    proposals: [{
      id: 'proposal-1',
      bidNoticeId: 'notice-1',
      supplierCompanyId: 'company-supplier-user',
      submittedByMemberId: 'supplier-user',
      file: { name: '제안서.pdf', size: 2048, url: '' },
      status: 'Submitted',
      submittedAt: '2026-06-24T09:00:00.000Z',
    }],
    evaluations: [],
  };

  const html = renderDashboard({
    state,
    memberId: 'supplier-user',
    selectedNoticeId: 'notice-1',
    now: '2026-06-25T09:00:00.000Z',
  });

  assert.match(html, /서울공급웍스/);
  assert.match(html, /제출 완료/);
  assert.match(html, /요청서\.pdf/);
  assert.doesNotMatch(html, /평가 점수|평가 메모|우선대상자|탈락자|제안서 다운로드/);
});
