import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember } from '../../src/domain/model.js';
import { closeNotice, publishNotice, startEvaluation, transitionNotice } from '../../src/domain/bid-notices.js';

const now = '2026-06-22T00:00:00.000Z';

function buyerFixture() {
  const company = createCompany({
    id: 'buyer-co',
    name: 'Buyer Co',
    businessRegistrationNumber: '100-00-00001',
    type: CompanyType.Buyer,
    status: CompanyStatus.Approved,
    contactName: 'Buyer',
    contactEmail: 'buyer@example.com',
  });
  const member = createMember({
    id: 'buyer-1',
    name: 'Buyer',
    email: 'buyer@example.com',
    role: MemberRole.Buyer,
    companyId: company.id,
  });
  const notice = createBidNotice({
    id: 'notice-1',
    buyerCompanyId: company.id,
    title: 'Office Cleaning',
    category: 'Facility',
    requirements: 'Daily cleaning for HQ.',
    deadlineAt: '2026-07-01T00:00:00.000Z',
    createdByMemberId: member.id,
  });
  return { company, member, notice };
}

test('buyer publishes a complete draft notice', () => {
  const { company, member, notice } = buyerFixture();

  const published = publishNotice({ notice, actor: member, buyerCompany: company, now });

  assert.equal(published.status, NoticeStatus.Published);
  assert.equal(published.publishedAt, now);
});

test('publishing rejects incomplete notices', () => {
  const { company, member, notice } = buyerFixture();
  const incomplete = { ...notice, title: '' };

  assert.throws(
    () => publishNotice({ notice: incomplete, actor: member, buyerCompany: company, now }),
    /제목, 카테고리, 요구사항, 마감일/
  );
});

test('notice transitions follow the allowed sequence', () => {
  const { notice } = buyerFixture();
  const published = { ...notice, status: NoticeStatus.Published };
  const closed = closeNotice({ notice: published, now });
  const evaluating = startEvaluation({ notice: closed, now });

  assert.equal(closed.status, NoticeStatus.Closed);
  assert.equal(evaluating.status, NoticeStatus.Evaluating);
  assert.throws(() => transitionNotice(notice, NoticeStatus.Awarded, now), /변경할 수 없습니다/);
});
