import { NoticeStatus, ProposalStatus } from './constants.js';
import { assertRule } from './errors.js';
import { createProposal } from './model.js';
import { canSubmitProposal } from './permissions.js';

function beforeDeadline(notice, now) {
  return new Date(now).getTime() < new Date(notice.deadlineAt).getTime();
}

export function discoverNotices(notices) {
  return notices.filter((notice) => notice.status === NoticeStatus.Published);
}

export function submitProposal({ actor, supplierCompany, notice, existingProposals, input, now = new Date().toISOString() }) {
  assertRule(
    canSubmitProposal({ actor, supplierCompany, notice, now }),
    'PROPOSAL_SUBMISSION_BLOCKED',
    '공급사는 마감 전 게시된 공고에만 제안을 제출할 수 있습니다.'
  );

  const hasActiveProposal = existingProposals.some(
    (proposal) =>
      proposal.bidNoticeId === notice.id &&
      proposal.supplierCompanyId === supplierCompany.id &&
      proposal.status !== ProposalStatus.Withdrawn
  );
  assertRule(!hasActiveProposal, 'ACTIVE_PROPOSAL_EXISTS', '같은 공고에는 진행 중인 제안을 하나만 제출할 수 있습니다.');

  return createProposal({
    id: input.id,
    bidNoticeId: notice.id,
    supplierCompanyId: supplierCompany.id,
    price: input.price,
    deliverySchedule: input.deliverySchedule,
    proposalText: input.proposalText,
    attachmentIds: input.attachmentIds || [],
    status: ProposalStatus.Submitted,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateProposal({ actor, notice, proposal, input, now = new Date().toISOString() }) {
  assertRule(actor.companyId === proposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', '공급사는 자기 회사 제안만 수정할 수 있습니다.');
  assertRule(proposal.status === ProposalStatus.Submitted, 'PROPOSAL_NOT_SUBMITTED', '제출된 제안만 수정할 수 있습니다.');
  assertRule(beforeDeadline(notice, now), 'DEADLINE_PASSED', '마감 이후에는 제안을 수정할 수 없습니다.');

  return {
    ...proposal,
    price: input.price || proposal.price,
    deliverySchedule: input.deliverySchedule || proposal.deliverySchedule,
    proposalText: input.proposalText || proposal.proposalText,
    attachmentIds: input.attachmentIds || proposal.attachmentIds,
    updatedAt: now,
  };
}

export function withdrawProposal({ actor, notice, proposal, now = new Date().toISOString() }) {
  assertRule(actor.companyId === proposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', '공급사는 자기 회사 제안만 철회할 수 있습니다.');
  assertRule(proposal.status === ProposalStatus.Submitted, 'PROPOSAL_NOT_SUBMITTED', '제출된 제안만 철회할 수 있습니다.');
  assertRule(beforeDeadline(notice, now), 'DEADLINE_PASSED', '마감 이후에는 제안을 철회할 수 없습니다.');

  return {
    ...proposal,
    status: ProposalStatus.Withdrawn,
    withdrawnAt: now,
    updatedAt: now,
  };
}
