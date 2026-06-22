import { MemberRole, NoticeStatus, ProposalStatus } from './constants.js';
import { assertRule } from './errors.js';
import { createEvaluation } from './model.js';
import { transitionNotice } from './bid-notices.js';

function assertScore(score, label) {
  assertRule(Number.isFinite(score) && score >= 0 && score <= 100, 'INVALID_SCORE', `${label} score must be between 0 and 100.`);
}

export function recordEvaluation({ id, notice, proposal, evaluator, priceScore, technicalScore, scheduleScore, note, now = new Date().toISOString() }) {
  assertRule(evaluator.role === MemberRole.Buyer, 'ONLY_BUYERS_EVALUATE', 'Only buyers can evaluate proposals.');
  assertRule(evaluator.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', 'Buyers can evaluate only their own notices.');
  assertRule(proposal.bidNoticeId === notice.id, 'PROPOSAL_NOTICE_MISMATCH', 'Proposal must belong to the notice being evaluated.');
  assertScore(priceScore, 'Price');
  assertScore(technicalScore, 'Technical');
  assertScore(scheduleScore, 'Schedule');

  return createEvaluation({
    id,
    bidNoticeId: notice.id,
    proposalId: proposal.id,
    evaluatorMemberId: evaluator.id,
    priceScore,
    technicalScore,
    scheduleScore,
    note,
    totalScore: priceScore + technicalScore + scheduleScore,
    createdAt: now,
    updatedAt: now,
  });
}

export function awardNotice({ notice, proposals, selectedProposalId, actor, awardReason, now = new Date().toISOString() }) {
  assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_AWARD', 'Only buyers can award notices.');
  assertRule(actor.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', 'Buyers can award only their own notices.');
  assertRule(notice.status === NoticeStatus.Evaluating, 'NOTICE_NOT_EVALUATING', 'A notice must be evaluating before it can be awarded.');

  const submittedProposals = proposals.filter((proposal) => proposal.status === ProposalStatus.Submitted);
  assertRule(submittedProposals.length > 0, 'NO_SUBMITTED_PROPOSALS', 'A notice cannot be awarded unless it has at least one submitted proposal.');

  const selectedProposal = submittedProposals.find((proposal) => proposal.id === selectedProposalId);
  assertRule(Boolean(selectedProposal), 'SELECTED_PROPOSAL_NOT_SUBMITTED', 'Only a submitted proposal can be selected.');

  const awardedNotice = {
    ...transitionNotice(notice, NoticeStatus.Awarded, now),
    awardedProposalId: selectedProposalId,
    awardReason,
  };

  return {
    notice: awardedNotice,
    proposals: proposals.map((proposal) => {
      if (proposal.id === selectedProposalId) {
        return { ...proposal, status: ProposalStatus.Selected, updatedAt: now };
      }
      if (proposal.status === ProposalStatus.Submitted) {
        return { ...proposal, status: ProposalStatus.NotSelected, updatedAt: now };
      }
      return proposal;
    }),
  };
}
