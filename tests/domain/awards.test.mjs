import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemberRole, NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createBidNotice, createMember, createProposal } from '../../src/domain/model.js';
import { awardNotice, recordEvaluation } from '../../src/domain/awards.js';

const buyer = createMember({ id: 'buyer', name: 'Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: 'buyer-co' });
const notice = createBidNotice({
  id: 'notice',
  buyerCompanyId: 'buyer-co',
  title: 'ERP',
  category: 'IT',
  requirements: 'Build ERP.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  createdByMemberId: buyer.id,
  status: NoticeStatus.Evaluating,
});
const proposalA = createProposal({ id: 'proposal-a', bidNoticeId: notice.id, supplierCompanyId: 'supplier-a', price: 100, deliverySchedule: '30 days', proposalText: 'A', status: ProposalStatus.Submitted });
const proposalB = createProposal({ id: 'proposal-b', bidNoticeId: notice.id, supplierCompanyId: 'supplier-b', price: 110, deliverySchedule: '25 days', proposalText: 'B', status: ProposalStatus.Submitted });

test('evaluation total is calculated from score fields', () => {
  const evaluation = recordEvaluation({
    id: 'eval-a',
    notice,
    proposal: proposalA,
    evaluator: buyer,
    priceScore: 35,
    technicalScore: 40,
    scheduleScore: 18,
    note: 'Strong proposal',
    now: '2026-07-02T00:00:00.000Z',
  });

  assert.equal(evaluation.totalScore, 93);
});

test('buyer awards exactly one submitted proposal and marks others not selected', () => {
  const result = awardNotice({
    notice,
    proposals: [proposalA, proposalB],
    selectedProposalId: proposalA.id,
    actor: buyer,
    awardReason: 'Best total score and delivery confidence.',
    now: '2026-07-02T00:00:00.000Z',
  });

  assert.equal(result.notice.status, NoticeStatus.Awarded);
  assert.equal(result.notice.awardedProposalId, proposalA.id);
  assert.equal(result.proposals.find((proposal) => proposal.id === proposalA.id).status, ProposalStatus.Selected);
  assert.equal(result.proposals.find((proposal) => proposal.id === proposalB.id).status, ProposalStatus.NotSelected);
});

test('notice with no submitted proposals cannot be awarded', () => {
  assert.throws(
    () => awardNotice({ notice, proposals: [], selectedProposalId: 'missing', actor: buyer, awardReason: 'No proposal', now: '2026-07-02T00:00:00.000Z' }),
    /제출된 제안이 하나 이상/
  );
});
