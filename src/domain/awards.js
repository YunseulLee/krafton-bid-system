import { MemberRole, NoticeStatus, ProposalStatus } from './constants.js';
import { assertRule } from './errors.js';
import { createEvaluation } from './model.js';
import { transitionNotice } from './bid-notices.js';

function assertScore(score, label) {
  assertRule(Number.isFinite(score) && score >= 0 && score <= 100, 'INVALID_SCORE', `${label} 점수는 0점 이상 100점 이하여야 합니다.`);
}

export function recordEvaluation({ id, notice, proposal, evaluator, priceScore, technicalScore, scheduleScore, note, now = new Date().toISOString() }) {
  assertRule(evaluator.role === MemberRole.Buyer, 'ONLY_BUYERS_EVALUATE', '구매자만 제안을 평가할 수 있습니다.');
  assertRule(evaluator.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', '구매자는 자기 회사 공고의 제안만 평가할 수 있습니다.');
  assertRule(proposal.bidNoticeId === notice.id, 'PROPOSAL_NOTICE_MISMATCH', '평가 대상 제안은 해당 공고에 속해야 합니다.');
  assertScore(priceScore, '가격');
  assertScore(technicalScore, '기술');
  assertScore(scheduleScore, '일정');

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
  assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_AWARD', '구매자만 낙찰을 선정할 수 있습니다.');
  assertRule(actor.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', '구매자는 자기 회사 공고만 낙찰 처리할 수 있습니다.');
  assertRule(notice.status === NoticeStatus.Evaluating, 'NOTICE_NOT_EVALUATING', '평가중 상태의 공고만 낙찰 처리할 수 있습니다.');

  const submittedProposals = proposals.filter((proposal) => proposal.status === ProposalStatus.Submitted);
  assertRule(submittedProposals.length > 0, 'NO_SUBMITTED_PROPOSALS', '제출된 제안이 하나 이상 있어야 낙찰 처리할 수 있습니다.');

  const selectedProposal = submittedProposals.find((proposal) => proposal.id === selectedProposalId);
  assertRule(Boolean(selectedProposal), 'SELECTED_PROPOSAL_NOT_SUBMITTED', '제출된 제안만 낙찰 대상으로 선택할 수 있습니다.');

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
