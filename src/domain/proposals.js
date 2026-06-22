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
    'Supplier can submit proposals only to published notices before the deadline.'
  );

  const hasActiveProposal = existingProposals.some(
    (proposal) =>
      proposal.bidNoticeId === notice.id &&
      proposal.supplierCompanyId === supplierCompany.id &&
      proposal.status !== ProposalStatus.Withdrawn
  );
  assertRule(!hasActiveProposal, 'ACTIVE_PROPOSAL_EXISTS', 'A supplier cannot submit more than one active proposal to the same notice.');

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
  assertRule(actor.companyId === proposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', 'Suppliers can update only their own proposals.');
  assertRule(proposal.status === ProposalStatus.Submitted, 'PROPOSAL_NOT_SUBMITTED', 'Only submitted proposals can be updated.');
  assertRule(beforeDeadline(notice, now), 'DEADLINE_PASSED', 'A supplier cannot update a proposal after the deadline.');

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
  assertRule(actor.companyId === proposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', 'Suppliers can withdraw only their own proposals.');
  assertRule(proposal.status === ProposalStatus.Submitted, 'PROPOSAL_NOT_SUBMITTED', 'Only submitted proposals can be withdrawn.');
  assertRule(beforeDeadline(notice, now), 'DEADLINE_PASSED', 'A supplier cannot withdraw a proposal after the deadline.');

  return {
    ...proposal,
    status: ProposalStatus.Withdrawn,
    withdrawnAt: now,
    updatedAt: now,
  };
}
