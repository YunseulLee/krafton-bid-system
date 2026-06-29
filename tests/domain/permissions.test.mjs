import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createProposal } from '../../src/domain/model.js';
import { canManageNotice, canSubmitProposal, canViewProposal, ensureActiveCompany } from '../../src/domain/permissions.js';

const buyerCompany = createCompany({
  id: 'buyer-co',
  name: 'Buyer Co',
  businessRegistrationNumber: '100',
  type: CompanyType.Buyer,
  status: CompanyStatus.Approved,
  contactName: 'Buyer',
  contactEmail: 'buyer@example.com',
});
const supplierCompany = createCompany({
  id: 'supplier-co',
  name: 'Supplier Co',
  businessRegistrationNumber: '200',
  type: CompanyType.Supplier,
  status: CompanyStatus.Approved,
  contactName: 'Supplier',
  contactEmail: 'supplier@example.com',
});
const buyer = createMember({ id: 'buyer', name: 'Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: buyerCompany.id });
const supplier = createMember({ id: 'supplier', name: 'Supplier', email: 'supplier@example.com', role: MemberRole.Supplier, companyId: supplierCompany.id });
const notice = createBidNotice({
  id: 'notice',
  buyerCompanyId: buyerCompany.id,
  title: 'Bid',
  category: 'IT',
  requirements: 'Build system.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  createdByMemberId: buyer.id,
  status: NoticeStatus.Published,
});
const proposal = createProposal({
  id: 'proposal',
  bidNoticeId: notice.id,
  supplierCompanyId: supplierCompany.id,
  price: 1000,
  deliverySchedule: '10 days',
  proposalText: 'Proposal',
});

test('buyers manage only their company notices', () => {
  assert.equal(canManageNotice(buyer, notice), true);
  assert.equal(canManageNotice({ ...buyer, companyId: 'other-co' }, notice), false);
});

test('suppliers submit only to published notices from other companies', () => {
  assert.equal(canSubmitProposal({ actor: supplier, supplierCompany, notice, now: '2026-06-22T00:00:00.000Z' }), true);
  assert.equal(canSubmitProposal({ actor: supplier, supplierCompany, notice: { ...notice, buyerCompanyId: supplierCompany.id }, now: '2026-06-22T00:00:00.000Z' }), false);
});

test('proposal visibility is limited to owning supplier, owning buyer, and operator', () => {
  const operator = createMember({ id: 'operator', name: 'Operator', email: 'ops@example.com', role: MemberRole.Operator });

  assert.equal(canViewProposal({ actor: supplier, notice, proposal }), true);
  assert.equal(canViewProposal({ actor: buyer, notice, proposal }), true);
  assert.equal(canViewProposal({ actor: operator, notice, proposal }), true);
  assert.equal(canViewProposal({ actor: { ...supplier, companyId: 'other-supplier' }, notice, proposal }), false);
});

test('suspended companies are rejected for transactional actions', () => {
  assert.throws(() => ensureActiveCompany({ ...supplierCompany, status: CompanyStatus.Suspended }), /정지된 업체/);
});
