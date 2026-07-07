import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createProposal } from '../../src/domain/model.js';
import { createInvitationMailTemplate, createResultMailTemplates } from '../../src/domain/outlook-mail-templates.js';

const notice = createBidNotice({
  id: 'notice-template',
  buyerCompanyId: 'platform-operator',
  title: '사무실 네트워크 고도화',
  category: '정보기술',
  summary: '사무실 네트워크 장비와 무선 환경을 개선합니다.',
  requirements: '제안요청서를 확인한 뒤 제안서를 제출해 주세요.',
  startsAt: '2026-06-22T00:00:00.000Z',
  deadlineAt: '2026-07-05T09:00:00.000Z',
  requestFile: {
    name: '사무실_네트워크_제안요청서.pdf',
    size: 348160,
    type: 'application/pdf',
  },
  status: NoticeStatus.Published,
  createdByMemberId: 'member-operator-1',
});

const supplierA = createCompany({
  id: 'company-supplier-a',
  name: '서울공급웍스',
  businessRegistrationNumber: '201-81-00002',
  type: CompanyType.Supplier,
  status: CompanyStatus.Approved,
  contactName: '이공급',
  contactEmail: 'supplier-a@example.com',
});

const supplierB = createCompany({
  id: 'company-supplier-b',
  name: '부산제안파트너스',
  businessRegistrationNumber: '202-81-00003',
  type: CompanyType.Supplier,
  status: CompanyStatus.Approved,
  contactName: '박제안',
  contactEmail: 'supplier-b@example.com',
});

test('invitation template is ready to paste into Outlook', () => {
  const template = createInvitationMailTemplate(notice);

  assert.equal(template.subject, '[입찰 안내] 사무실 네트워크 고도화');
  assert.match(template.body, /입찰중/);
  assert.match(template.body, /사무실 네트워크 고도화/);
  assert.match(template.body, /제안요청서/);
  assert.match(template.body, /사무실_네트워크_제안요청서\.pdf/);
  assert.match(template.body, /18:00/);
  assert.match(template.body, /Outlook/);
});

test('result templates split preferred and rejected suppliers without exposing evaluation scores', () => {
  const proposals = [
    createProposal({
      id: 'proposal-selected',
      bidNoticeId: notice.id,
      supplierCompanyId: supplierA.id,
      proposalText: '제안서 파일로 제출했습니다.',
      status: ProposalStatus.Selected,
    }),
    createProposal({
      id: 'proposal-rejected',
      bidNoticeId: notice.id,
      supplierCompanyId: supplierB.id,
      proposalText: '제안서 파일로 제출했습니다.',
      status: ProposalStatus.NotSelected,
    }),
  ];

  const templates = createResultMailTemplates({
    notice,
    proposals,
    companies: [supplierA, supplierB],
  });

  assert.equal(templates.preferred.length, 1);
  assert.equal(templates.rejected.length, 1);
  assert.match(templates.preferred[0].subject, /우선대상자 선정/);
  assert.match(templates.preferred[0].body, /서울공급웍스/);
  assert.match(templates.rejected[0].subject, /입찰 결과 안내/);
  assert.match(templates.rejected[0].body, /부산제안파트너스/);
  assert.match(templates.rejected[0].body, /선정되지 않았습니다/);
  assert.doesNotMatch(`${templates.preferred[0].body}\n${templates.rejected[0].body}`, /92|평가 점수|평가 메모/);
});
