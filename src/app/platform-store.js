import { ActivityAction, CompanyStatus, CompanyType, MemberRole, NoticeStatus } from '../domain/constants.js';
import { assertRule } from '../domain/errors.js';
import { createActivityLog, createBidNotice } from '../domain/model.js';
import { closeNotice as closeNoticeDomain, publishNotice as publishNoticeDomain, startEvaluation as startEvaluationDomain } from '../domain/bid-notices.js';
import { submitProposal as submitProposalDomain } from '../domain/proposals.js';
import { awardNotice as awardNoticeDomain, recordEvaluation as recordEvaluationDomain } from '../domain/awards.js';
import { hideNotice as hideNoticeDomain, restoreNotice as restoreNoticeDomain } from '../domain/moderation.js';

function replaceById(items, nextItem) {
  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

export function createPlatformStore(seed) {
  const state = structuredClone(seed);

  function member(id) {
    const found = state.members.find((item) => item.id === id);
    assertRule(Boolean(found), 'MEMBER_NOT_FOUND', `Member ${id} was not found.`);
    return found;
  }

  function company(id) {
    const found = state.companies.find((item) => item.id === id);
    assertRule(Boolean(found), 'COMPANY_NOT_FOUND', `Company ${id} was not found.`);
    return found;
  }

  function notice(id) {
    const found = state.notices.find((item) => item.id === id);
    assertRule(Boolean(found), 'NOTICE_NOT_FOUND', `Notice ${id} was not found.`);
    return found;
  }

  function proposal(id) {
    const found = state.proposals.find((item) => item.id === id);
    assertRule(Boolean(found), 'PROPOSAL_NOT_FOUND', `Proposal ${id} was not found.`);
    return found;
  }

  function record(actor, targetType, targetId, action, metadata, now) {
    state.activity.push(createActivityLog({
      id: `${action}-${targetId}-${state.activity.length + 1}`,
      actorMemberId: actor.id,
      actorCompanyId: actor.companyId,
      targetType,
      targetId,
      action,
      metadata,
      createdAt: now,
    }));
  }

  return {
    snapshot() {
      return structuredClone(state);
    },
    listActivity() {
      return [...state.activity];
    },
    saveNotice(memberId, noticeId) {
      const actor = member(memberId);
      const currentNotice = notice(noticeId);
      assertRule(actor.role === MemberRole.Supplier, 'ONLY_SUPPLIERS_SAVE_NOTICES', 'Only suppliers can save bid notices.');
      assertRule(currentNotice.status === NoticeStatus.Published, 'NOTICE_NOT_PUBLIC', 'Suppliers can save only public bid notices.');
      const existing = state.savedNotices.find((item) => item.memberId === memberId && item.noticeId === currentNotice.id);
      if (existing) return existing;
      const savedNotice = { memberId, noticeId: currentNotice.id, savedAt: new Date().toISOString() };
      state.savedNotices.push(savedNotice);
      return savedNotice;
    },
    listSavedNotices(memberId) {
      const actor = member(memberId);
      assertRule(actor.role === MemberRole.Supplier, 'ONLY_SUPPLIERS_VIEW_SAVED_NOTICES', 'Only suppliers can view saved notices.');
      return state.savedNotices.filter((item) => item.memberId === memberId);
    },
    createNotice(memberId, input) {
      const actor = member(memberId);
      const buyerCompany = company(actor.companyId);
      assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_CREATE_NOTICES', 'Only buyers can create bid notices.');
      assertRule(buyerCompany.type === CompanyType.Buyer, 'BUYER_COMPANY_REQUIRED', 'Only buyer companies can create notices.');
      assertRule(buyerCompany.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', 'Buyer company must be approved before creating notices.');
      const nextNotice = createBidNotice({ ...input, buyerCompanyId: actor.companyId, createdByMemberId: actor.id });
      state.notices.push(nextNotice);
      return nextNotice;
    },
    publishNotice(memberId, noticeId, now) {
      const actor = member(memberId);
      const current = notice(noticeId);
      const buyerCompany = company(current.buyerCompanyId);
      const next = publishNoticeDomain({ notice: current, actor, buyerCompany, now });
      state.notices = replaceById(state.notices, next);
      record(actor, 'BidNotice', next.id, ActivityAction.NoticePublished, {}, now);
      return next;
    },
    submitProposal(memberId, noticeId, input, now) {
      const actor = member(memberId);
      const supplierCompany = company(actor.companyId);
      const currentNotice = notice(noticeId);
      const next = submitProposalDomain({ actor, supplierCompany, notice: currentNotice, existingProposals: state.proposals, input, now });
      state.proposals.push(next);
      record(actor, 'Proposal', next.id, ActivityAction.ProposalSubmitted, { bidNoticeId: noticeId }, now);
      return next;
    },
    closeNotice(noticeId, now) {
      const current = notice(noticeId);
      const next = closeNoticeDomain({ notice: current, now });
      state.notices = replaceById(state.notices, next);
      return next;
    },
    startEvaluation(memberId, noticeId, now) {
      const actor = member(memberId);
      const current = notice(noticeId);
      assertRule(
        actor.role === MemberRole.Buyer && actor.companyId === current.buyerCompanyId,
        'NOTICE_OWNER_REQUIRED',
        'Buyers can evaluate only their own company notices.'
      );
      const next = startEvaluationDomain({ notice: current, now });
      state.notices = replaceById(state.notices, next);
      return next;
    },
    recordEvaluation(memberId, proposalId, input, now) {
      const actor = member(memberId);
      const currentProposal = proposal(proposalId);
      const currentNotice = notice(currentProposal.bidNoticeId);
      const evaluation = recordEvaluationDomain({
        id: `evaluation-${state.evaluations.length + 1}`,
        notice: currentNotice,
        proposal: currentProposal,
        evaluator: actor,
        ...input,
        now,
      });
      state.evaluations.push(evaluation);
      return evaluation;
    },
    awardNotice(memberId, noticeId, selectedProposalId, awardReason, now) {
      const actor = member(memberId);
      const currentNotice = notice(noticeId);
      const relatedProposals = state.proposals.filter((item) => item.bidNoticeId === noticeId);
      const result = awardNoticeDomain({ notice: currentNotice, proposals: relatedProposals, selectedProposalId, actor, awardReason, now });
      state.notices = replaceById(state.notices, result.notice);
      state.proposals = state.proposals.map((item) => result.proposals.find((proposalItem) => proposalItem.id === item.id) || item);
      record(actor, 'BidNotice', noticeId, ActivityAction.NoticeAwarded, { selectedProposalId }, now);
      return result;
    },
    hideNotice(memberId, noticeId, reason, now) {
      const actor = member(memberId);
      const result = hideNoticeDomain({ notice: notice(noticeId), actor, reason, now });
      state.notices = replaceById(state.notices, result.notice);
      state.activity.push(result.activity);
      return result;
    },
    restoreNotice(memberId, noticeId, now) {
      const actor = member(memberId);
      const result = restoreNoticeDomain({ notice: notice(noticeId), actor, now });
      state.notices = replaceById(state.notices, result.notice);
      state.activity.push(result.activity);
      return result;
    },
    getProposalForSupplier(memberId, proposalId) {
      const actor = member(memberId);
      const currentProposal = proposal(proposalId);
      assertRule(actor.companyId === currentProposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', 'Suppliers can view only their own proposal results.');
      return currentProposal;
    },
  };
}
