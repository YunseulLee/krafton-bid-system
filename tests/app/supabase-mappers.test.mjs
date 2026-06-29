import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapEvaluationRow, mapNoticeRow, mapProfileRow, mapProposalRow } from '../../src/app/supabase-mappers.js';

test('mapProfileRow converts Supabase roles to render roles', () => {
  assert.deepEqual(mapProfileRow({
    id: 'user-1',
    email: 'supplier@example.com',
    name: '홍길동',
    company_name: '서울공급웍스',
    role: 'supplier',
  }), {
    id: 'user-1',
    email: 'supplier@example.com',
    name: '홍길동',
    role: 'Supplier',
    companyId: 'company-user-1',
    companyName: '서울공급웍스',
  });

  assert.deepEqual(mapProfileRow({
    id: 'operator-1',
    email: 'operator@example.com',
    name: '박운영',
    company_name: '운영사',
    role: 'operator',
  }), {
    id: 'operator-1',
    email: 'operator@example.com',
    name: '박운영',
    role: 'Operator',
    companyId: 'company-operator-1',
    companyName: '운영사',
  });

  assert.equal(mapProfileRow({
    id: 'supplier-2',
    email: 'new@example.com',
    name: '신규 담당자',
    company_name: '신규업체',
    role: 'supplier',
    login_expires_at: '2026-07-09T00:00:00.000Z',
  }).loginExpiresAt, '2026-07-09T00:00:00.000Z');
});

test('mapNoticeRow converts file metadata and published status', () => {
  const notice = mapNoticeRow({
    id: 'notice-1',
    title: '공고',
    category: 'IT',
    summary: '요약',
    starts_at: '2026-06-24T09:00:00.000Z',
    deadline_at: '2026-07-01T09:00:00.000Z',
    status: 'published',
    rfp_file_name: '요청서.pdf',
    rfp_file_size: 1024,
    rfp_download_url: 'https://signed-url.example/rfp',
    preferred_proposal_id: null,
    result_notified_at: null,
  });

  assert.equal(notice.status, 'Published');
  assert.equal(notice.requestFile.name, '요청서.pdf');
  assert.equal(notice.requestFile.url, 'https://signed-url.example/rfp');
});

test('mapProposalRow hides result classification in participant mode', () => {
  const proposal = mapProposalRow({
    id: 'proposal-1',
    notice_id: 'notice-1',
    supplier_id: 'supplier-1',
    supplier_company_name: '서울공급웍스',
    file_name: '제안서.pdf',
    file_size: 2048,
    file_download_url: '',
    status: 'selected',
    submitted_at: '2026-06-25T09:00:00.000Z',
  }, { participantSafe: true });

  assert.equal(proposal.status, 'Submitted');
  assert.equal(proposal.file.name, '제안서.pdf');
  assert.equal(proposal.file.url, '');
});

test('mapProposalRow removes proposal download urls in participant mode', () => {
  const proposal = mapProposalRow({
    id: 'proposal-1',
    notice_id: 'notice-1',
    supplier_id: 'supplier-1',
    supplier_company_name: '서울공급웍스',
    file_name: '제안서.pdf',
    file_size: 2048,
    file_download_url: 'https://signed-url.example/proposal',
    status: 'not_selected',
    submitted_at: '2026-06-25T09:00:00.000Z',
  }, { participantSafe: true });

  assert.equal(proposal.status, 'Submitted');
  assert.equal(proposal.file.url, '');
});

test('mapEvaluationRow converts score and note fields to render evaluation shape', () => {
  assert.deepEqual(mapEvaluationRow({
    id: 'evaluation-1',
    notice_id: 'notice-1',
    proposal_id: 'proposal-1',
    evaluator_id: 'operator-1',
    score: 92,
    note: '기술 적합도가 높습니다.',
    created_at: '2026-06-26T09:00:00.000Z',
    updated_at: '2026-06-26T10:00:00.000Z',
  }), {
    id: 'evaluation-1',
    bidNoticeId: 'notice-1',
    proposalId: 'proposal-1',
    evaluatorMemberId: 'operator-1',
    priceScore: 92,
    technicalScore: 0,
    scheduleScore: 0,
    note: '기술 적합도가 높습니다.',
    totalScore: 92,
    createdAt: '2026-06-26T09:00:00.000Z',
    updatedAt: '2026-06-26T10:00:00.000Z',
  });
});
