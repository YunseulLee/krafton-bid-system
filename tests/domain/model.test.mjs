import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createProposal } from '../../src/domain/model.js';

test('company, member, notice, and proposal factories set required defaults', () => {
  const buyerCompany = createCompany({
    id: 'company-buyer',
    name: 'Acme Buyer',
    businessRegistrationNumber: '100-00-00001',
    type: CompanyType.Buyer,
    contactName: 'Buyer Manager',
    contactEmail: 'buyer@example.com',
  });

  const buyer = createMember({
    id: 'member-buyer',
    name: 'Buyer Manager',
    email: 'buyer@example.com',
    role: MemberRole.Buyer,
    companyId: buyerCompany.id,
  });

  const notice = createBidNotice({
    id: 'notice-1',
    buyerCompanyId: buyerCompany.id,
    title: 'Warehouse Renovation',
    category: 'Construction',
    requirements: 'Repair loading dock and floor.',
    deadlineAt: '2026-07-15T09:00:00.000Z',
    createdByMemberId: buyer.id,
  });

  const proposal = createProposal({
    id: 'proposal-1',
    bidNoticeId: notice.id,
    supplierCompanyId: 'company-supplier',
    price: 12000000,
    deliverySchedule: '30 days',
    proposalText: 'We can complete the work in July.',
  });

  assert.equal(buyerCompany.status, CompanyStatus.Pending);
  assert.equal(buyer.status, 'Active');
  assert.equal(notice.status, NoticeStatus.Draft);
  assert.equal(proposal.status, ProposalStatus.Draft);
  assert.equal(notice.requestFile, null);
  assert.deepEqual(notice.attachmentRequirements, []);
  assert.deepEqual(proposal.attachmentIds, []);
});
