import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, MemberRole, NoticeStatus, ReportStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createReport } from '../../src/domain/model.js';
import { approveCompany, hideNotice, resolveReport, restoreNotice, suspendCompany } from '../../src/domain/moderation.js';

const operator = createMember({ id: 'operator', name: 'Operator', email: 'ops@example.com', role: MemberRole.Operator });
const nonOperator = createMember({ id: 'buyer', name: 'Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: 'buyer-co' });
const pendingCompany = createCompany({ id: 'supplier-co', name: 'Supplier', businessRegistrationNumber: '200', type: 'Supplier', contactName: 'Supplier', contactEmail: 'supplier@example.com' });
const publishedNotice = createBidNotice({
  id: 'notice',
  buyerCompanyId: 'buyer-co',
  title: 'Cleaning',
  category: 'Facility',
  requirements: 'Daily cleaning.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  evaluationCriteria: 'Price 50, service 50',
  createdByMemberId: 'buyer',
  status: NoticeStatus.Published,
});

test('operator approves and suspends companies', () => {
  const approved = approveCompany({ company: pendingCompany, actor: operator, now: '2026-06-22T00:00:00.000Z' });
  const suspended = suspendCompany({ company: approved.company, actor: operator, now: '2026-06-23T00:00:00.000Z' });

  assert.equal(approved.company.status, CompanyStatus.Approved);
  assert.equal(suspended.company.status, CompanyStatus.Suspended);
  assert.equal(approved.activity.action, 'CompanyApproved');
  assert.throws(() => approveCompany({ company: pendingCompany, actor: nonOperator }), /Only operators/);
});

test('operator hides and restores notices', () => {
  const hidden = hideNotice({ notice: publishedNotice, actor: operator, reason: 'Spam report', now: '2026-06-22T00:00:00.000Z' });
  const restored = restoreNotice({ notice: hidden.notice, actor: operator, now: '2026-06-23T00:00:00.000Z' });

  assert.equal(hidden.notice.status, NoticeStatus.Hidden);
  assert.equal(restored.notice.status, NoticeStatus.Published);
});

test('operator resolves reports', () => {
  const report = createReport({ id: 'report', reporterMemberId: 'supplier', targetType: 'BidNotice', targetId: publishedNotice.id, reason: 'Suspicious notice' });

  const resolved = resolveReport({ report, actor: operator, status: ReportStatus.Resolved, now: '2026-06-22T00:00:00.000Z' });

  assert.equal(resolved.report.status, ReportStatus.Resolved);
  assert.equal(resolved.activity.action, 'ReportResolved');
});
