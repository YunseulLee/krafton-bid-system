import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createProposal } from '../../src/domain/model.js';
import { discoverNotices, submitProposal, updateProposal, withdrawProposal } from '../../src/domain/proposals.js';

const now = '2026-06-22T00:00:00.000Z';
const buyerCompany = createCompany({ id: 'buyer-co', name: 'Buyer Co', businessRegistrationNumber: '100', type: CompanyType.Buyer, status: CompanyStatus.Approved, contactName: 'Buyer', contactEmail: 'buyer@example.com' });
const supplierCompany = createCompany({ id: 'supplier-co', name: 'Supplier Co', businessRegistrationNumber: '200', type: CompanyType.Supplier, status: CompanyStatus.Approved, contactName: 'Supplier', contactEmail: 'supplier@example.com' });
const supplier = createMember({ id: 'supplier', name: 'Supplier', email: 'supplier@example.com', role: MemberRole.Supplier, companyId: supplierCompany.id });
const publishedNotice = createBidNotice({
  id: 'notice',
  buyerCompanyId: buyerCompany.id,
  title: 'ERP Build',
  category: 'IT',
  requirements: 'Build ERP MVP.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  evaluationCriteria: 'Price 40, technical 40, schedule 20',
  createdByMemberId: 'buyer',
  status: NoticeStatus.Published,
});

test('suppliers discover published notices and not hidden notices', () => {
  const hiddenNotice = { ...publishedNotice, id: 'hidden', status: NoticeStatus.Hidden };

  const result = discoverNotices([publishedNotice, hiddenNotice]);

  assert.deepEqual(result.map((notice) => notice.id), ['notice']);
});

test('supplier submits one active proposal before the deadline', () => {
  const proposal = submitProposal({
    actor: supplier,
    supplierCompany,
    notice: publishedNotice,
    existingProposals: [],
    input: { id: 'proposal', price: 5000000, deliverySchedule: '45 days', proposalText: 'We can deliver.' },
    now,
  });

  assert.equal(proposal.status, ProposalStatus.Submitted);
  assert.equal(proposal.submittedAt, now);
});

test('supplier cannot submit twice to the same notice', () => {
  const existing = createProposal({
    id: 'proposal-existing',
    bidNoticeId: publishedNotice.id,
    supplierCompanyId: supplierCompany.id,
    price: 5000000,
    deliverySchedule: '45 days',
    proposalText: 'Existing proposal',
    status: ProposalStatus.Submitted,
  });

  assert.throws(
    () => submitProposal({ actor: supplier, supplierCompany, notice: publishedNotice, existingProposals: [existing], input: { id: 'proposal-new', price: 5100000, deliverySchedule: '40 days', proposalText: 'New proposal' }, now }),
    /one active proposal/
  );
});

test('supplier updates and withdraws own proposal before deadline only', () => {
  const submitted = createProposal({
    id: 'proposal',
    bidNoticeId: publishedNotice.id,
    supplierCompanyId: supplierCompany.id,
    price: 5000000,
    deliverySchedule: '45 days',
    proposalText: 'Original',
    status: ProposalStatus.Submitted,
  });

  const updated = updateProposal({ actor: supplier, notice: publishedNotice, proposal: submitted, input: { price: 4900000, proposalText: 'Updated' }, now });
  const withdrawn = withdrawProposal({ actor: supplier, notice: publishedNotice, proposal: updated, now });

  assert.equal(updated.price, 4900000);
  assert.equal(withdrawn.status, ProposalStatus.Withdrawn);
  assert.throws(() => updateProposal({ actor: supplier, notice: publishedNotice, proposal: submitted, input: { price: 4800000 }, now: '2026-07-02T00:00:00.000Z' }), /after the deadline/);
});
