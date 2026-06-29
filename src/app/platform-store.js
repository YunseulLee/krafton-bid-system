import { ActivityAction, CompanyStatus, CompanyType, MemberRole, NoticeStatus, ProposalStatus } from '../domain/constants.js';
import { assertRule } from '../domain/errors.js';
import { createActivityLog, createBidNotice, createEvaluation, createProposal } from '../domain/model.js';
import { closeNotice as closeNoticeDomain, publishNotice as publishNoticeDomain, startEvaluation as startEvaluationDomain } from '../domain/bid-notices.js';
import { submitProposal as submitProposalDomain } from '../domain/proposals.js';
import { awardNotice as awardNoticeDomain, recordEvaluation as recordEvaluationDomain } from '../domain/awards.js';
import { hideNotice as hideNoticeDomain, restoreNotice as restoreNoticeDomain } from '../domain/moderation.js';

function replaceById(items, nextItem) {
  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function isNoticeOpen(notice, now) {
  const currentTime = new Date(now).getTime();
  const startsAt = notice.startsAt ? new Date(notice.startsAt).getTime() : Number.NEGATIVE_INFINITY;
  const deadlineAt = new Date(notice.deadlineAt).getTime();
  return notice.status === NoticeStatus.Published && startsAt <= currentTime && currentTime <= deadlineAt;
}

function hasNoticeEnded(notice, now) {
  return new Date(now).getTime() > new Date(notice.deadlineAt).getTime();
}

function hasSelectedProposal(proposals, noticeId) {
  return proposals.some((item) => item.bidNoticeId === noticeId && item.status === ProposalStatus.Selected);
}

function hasEvaluation(evaluations, proposalId) {
  return evaluations.some((item) => item.proposalId === proposalId);
}

function allProposalsEvaluated(evaluations, proposals) {
  return proposals.length > 0 && proposals.every((item) => hasEvaluation(evaluations, item.id));
}

function toFileMetadata(file) {
  if (!file?.name) return null;
  return {
    name: file.name,
    size: file.size || 0,
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified ?? null,
    url: file.url || '',
  };
}

function supplierVisibleProposal(proposal) {
  if (![ProposalStatus.Selected, ProposalStatus.NotSelected].includes(proposal.status)) return proposal;
  return {
    ...proposal,
    status: ProposalStatus.Submitted,
  };
}

export function createPlatformStore(seed) {
  const state = structuredClone(seed);

  function member(id) {
    const found = state.members.find((item) => item.id === id);
    assertRule(Boolean(found), 'MEMBER_NOT_FOUND', `사용자 ${id}를 찾을 수 없습니다.`);
    return found;
  }

  function company(id) {
    const found = state.companies.find((item) => item.id === id);
    assertRule(Boolean(found), 'COMPANY_NOT_FOUND', `업체 ${id}를 찾을 수 없습니다.`);
    return found;
  }

  function notice(id) {
    const found = state.notices.find((item) => item.id === id);
    assertRule(Boolean(found), 'NOTICE_NOT_FOUND', `공고 ${id}를 찾을 수 없습니다.`);
    return found;
  }

  function proposal(id) {
    const found = state.proposals.find((item) => item.id === id);
    assertRule(Boolean(found), 'PROPOSAL_NOT_FOUND', `제안 ${id}를 찾을 수 없습니다.`);
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
      assertRule(actor.role === MemberRole.Supplier, 'ONLY_SUPPLIERS_SAVE_NOTICES', '공급사만 입찰 공고를 저장할 수 있습니다.');
      assertRule(currentNotice.status === NoticeStatus.Published, 'NOTICE_NOT_PUBLIC', '공급사는 공개된 입찰 공고만 저장할 수 있습니다.');
      const existing = state.savedNotices.find((item) => item.memberId === memberId && item.noticeId === currentNotice.id);
      if (existing) return existing;
      const savedNotice = { memberId, noticeId: currentNotice.id, savedAt: new Date().toISOString() };
      state.savedNotices.push(savedNotice);
      return savedNotice;
    },
    listSavedNotices(memberId) {
      const actor = member(memberId);
      assertRule(actor.role === MemberRole.Supplier, 'ONLY_SUPPLIERS_VIEW_SAVED_NOTICES', '공급사만 저장한 공고를 볼 수 있습니다.');
      return state.savedNotices.filter((item) => item.memberId === memberId);
    },
    createOperatorNotice(memberId, input, now = new Date().toISOString()) {
      const actor = member(memberId);
      assertRule(actor.role === MemberRole.Operator, 'ONLY_OPERATORS_CREATE_NOTICES', '운영자만 공고를 추가할 수 있습니다.');
      assertRule(
        new Date(input.startsAt).getTime() < new Date(input.deadlineAt).getTime(),
        'INVALID_NOTICE_PERIOD',
        '공고 시작일은 종료일보다 앞서야 합니다.'
      );
      assertRule(Boolean(input.requestFile?.name), 'REQUEST_FILE_REQUIRED', '제안요청서 파일을 선택해야 합니다.');
      const nextNotice = createBidNotice({
        id: input.id,
        buyerCompanyId: 'platform-operator',
        title: input.title,
        category: input.category,
        summary: input.summary,
        requirements: input.requirements,
        startsAt: input.startsAt,
        deadlineAt: input.deadlineAt,
        requestFile: toFileMetadata(input.requestFile),
        attachmentRequirements: input.attachmentRequirements || ['제안서 파일'],
        status: NoticeStatus.Published,
        createdByMemberId: actor.id,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      });
      state.notices.push(nextNotice);
      record(actor, 'BidNotice', nextNotice.id, ActivityAction.NoticePublished, {}, now);
      return nextNotice;
    },
    createNotice(memberId, input) {
      const actor = member(memberId);
      const buyerCompany = company(actor.companyId);
      assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_CREATE_NOTICES', '구매자만 입찰 공고를 만들 수 있습니다.');
      assertRule(buyerCompany.type === CompanyType.Buyer, 'BUYER_COMPANY_REQUIRED', '구매 업체만 공고를 만들 수 있습니다.');
      assertRule(buyerCompany.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', '공고를 만들려면 구매 업체 승인이 필요합니다.');
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
    submitProposalFile(memberId, noticeId, file, now = new Date().toISOString()) {
      const actor = member(memberId);
      const supplierCompany = company(actor.companyId);
      const currentNotice = notice(noticeId);
      assertRule(actor.role === MemberRole.Supplier, 'ONLY_PARTICIPANTS_SUBMIT_FILES', '입찰 참여자만 제안서 파일을 제출할 수 있습니다.');
      assertRule(supplierCompany.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', '승인된 업체만 제안서를 제출할 수 있습니다.');
      assertRule(isNoticeOpen(currentNotice, now), 'NOTICE_NOT_OPEN', '공고 기간 안에만 제안서를 제출할 수 있습니다.');
      assertRule(Boolean(file?.name), 'PROPOSAL_FILE_REQUIRED', '제안서 파일을 선택해야 합니다.');
      const existing = state.proposals.find(
        (item) =>
          item.bidNoticeId === noticeId &&
          item.supplierCompanyId === supplierCompany.id &&
          item.status !== ProposalStatus.Withdrawn
      );
      if (existing) {
        assertRule(existing.status === ProposalStatus.Submitted, 'PROPOSAL_NOT_SUBMITTED', '제출 상태의 제안서 파일만 교체할 수 있습니다.');
        const previousFile = existing.file?.name
          ? { ...existing.file, replacedAt: now }
          : null;
        const next = {
          ...existing,
          file: toFileMetadata(file),
          fileHistory: previousFile ? [...(existing.fileHistory || []), previousFile] : (existing.fileHistory || []),
          updatedAt: now,
        };
        state.proposals = replaceById(state.proposals, next);
        record(actor, 'Proposal', next.id, ActivityAction.ProposalUpdated, {
          bidNoticeId: noticeId,
          previousFileName: previousFile?.name || '',
          fileName: next.file.name,
        }, now);
        return next;
      }

      const next = createProposal({
        id: `proposal-file-${state.proposals.length + 1}`,
        bidNoticeId: currentNotice.id,
        supplierCompanyId: supplierCompany.id,
        submittedByMemberId: actor.id,
        price: null,
        deliverySchedule: '',
        proposalText: '제안서 파일로 제출했습니다.',
        file: {
          name: file.name,
          size: file.size || 0,
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified || null,
        },
        status: ProposalStatus.Submitted,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      state.proposals.push(next);
      record(actor, 'Proposal', next.id, ActivityAction.ProposalSubmitted, { bidNoticeId: noticeId, fileName: next.file.name }, now);
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
        '구매자는 자기 회사 공고만 평가할 수 있습니다.'
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
    listOperatorSubmissions(memberId, noticeId, now = new Date().toISOString()) {
      const actor = member(memberId);
      const currentNotice = notice(noticeId);
      assertRule(actor.role === MemberRole.Operator, 'ONLY_OPERATORS_VIEW_SUBMISSIONS', '운영자만 제출 파일을 확인할 수 있습니다.');
      const canOpenFiles = hasNoticeEnded(currentNotice, now);
      const submissions = state.proposals
        .filter((item) => item.bidNoticeId === noticeId)
        .map((item) => ({
          ...item,
          file: canOpenFiles ? item.file : null,
          lockedReason: canOpenFiles ? '' : '공고 기간 종료 후 열람 가능합니다.',
        }));
      return { notice: currentNotice, canOpenFiles, submissions };
    },
    evaluateSubmission(memberId, proposalId, input, now = new Date().toISOString()) {
      const actor = member(memberId);
      const currentProposal = proposal(proposalId);
      const currentNotice = notice(currentProposal.bidNoticeId);
      assertRule(actor.role === MemberRole.Operator, 'ONLY_OPERATORS_EVALUATE_SUBMISSIONS', '운영자만 제출 파일을 평가할 수 있습니다.');
      assertRule(hasNoticeEnded(currentNotice, now), 'NOTICE_PERIOD_NOT_ENDED', '공고 기간 종료 후 평가할 수 있습니다.');
      assertRule(!currentNotice.resultNotifiedAt, 'RESULT_NOTIFICATION_ALREADY_COMPLETE', '결과 통보 완료 후에는 평가를 수정할 수 없습니다.');
      assertRule(Number.isFinite(input.score) && input.score >= 0 && input.score <= 100, 'INVALID_SCORE', '평가 점수는 0점 이상 100점 이하여야 합니다.');
      const evaluation = createEvaluation({
        id: `evaluation-${state.evaluations.length + 1}`,
        bidNoticeId: currentNotice.id,
        proposalId: currentProposal.id,
        evaluatorMemberId: actor.id,
        priceScore: input.score,
        technicalScore: 0,
        scheduleScore: 0,
        note: input.note,
        totalScore: input.score,
        createdAt: now,
        updatedAt: now,
      });
      state.evaluations.push(evaluation);
      return evaluation;
    },
    selectPreferredProposal(memberId, proposalId, now = new Date().toISOString()) {
      const actor = member(memberId);
      const selected = proposal(proposalId);
      const currentNotice = notice(selected.bidNoticeId);
      assertRule(actor.role === MemberRole.Operator, 'ONLY_OPERATORS_SELECT_RESULTS', '운영자만 우선대상자를 선택할 수 있습니다.');
      assertRule(hasNoticeEnded(currentNotice, now), 'NOTICE_PERIOD_NOT_ENDED', '공고 기간 종료 후 우선대상자를 선택할 수 있습니다.');
      assertRule(!currentNotice.resultNotifiedAt, 'RESULT_NOTIFICATION_ALREADY_COMPLETE', '결과 통보 완료 후에는 우선대상자를 변경할 수 없습니다.');
      const relatedProposals = state.proposals.filter(
        (item) => item.bidNoticeId === currentNotice.id && item.status !== ProposalStatus.Withdrawn
      );
      assertRule(relatedProposals.some((item) => item.id === selected.id), 'PROPOSAL_NOTICE_MISMATCH', '선택한 제안서는 해당 공고에 속해야 합니다.');
      assertRule(
        allProposalsEvaluated(state.evaluations, relatedProposals),
        'EVALUATION_REQUIRED_BEFORE_SELECTION',
        '모든 제출 업체의 평가를 저장한 뒤 우선대상자를 선택할 수 있습니다.'
      );

      state.proposals = state.proposals.map((item) => {
        if (item.bidNoticeId !== currentNotice.id || item.status === ProposalStatus.Withdrawn) return item;
        return {
          ...item,
          status: item.id === selected.id ? ProposalStatus.Selected : ProposalStatus.NotSelected,
          updatedAt: now,
        };
      });

      const selectedProposal = state.proposals.find((item) => item.id === selected.id);
      const rejectedProposals = state.proposals.filter(
        (item) => item.bidNoticeId === currentNotice.id && item.status === ProposalStatus.NotSelected
      );
      const nextNotice = {
        ...currentNotice,
        awardedProposalId: selected.id,
        awardedAt: now,
        resultNotifiedAt: null,
        updatedAt: now,
      };
      state.notices = replaceById(state.notices, nextNotice);
      record(actor, 'BidNotice', currentNotice.id, ActivityAction.NoticeAwarded, { selectedProposalId: selected.id }, now);
      return { notice: nextNotice, selectedProposal, rejectedProposals };
    },
    markResultNotificationComplete(memberId, noticeId, now = new Date().toISOString()) {
      const actor = member(memberId);
      const currentNotice = notice(noticeId);
      assertRule(actor.role === MemberRole.Operator, 'ONLY_OPERATORS_COMPLETE_NOTIFICATION', '운영자만 통보 완료 상태를 기록할 수 있습니다.');
      assertRule(hasSelectedProposal(state.proposals, currentNotice.id), 'PREFERRED_PROPOSAL_REQUIRED', '우선대상자를 먼저 선택해야 통보 완료를 기록할 수 있습니다.');
      const nextNotice = {
        ...currentNotice,
        resultNotifiedAt: now,
        updatedAt: now,
      };
      state.notices = replaceById(state.notices, nextNotice);
      return nextNotice;
    },
    getProposalForSupplier(memberId, proposalId) {
      const actor = member(memberId);
      const currentProposal = proposal(proposalId);
      assertRule(actor.companyId === currentProposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', '공급사는 자기 회사 제안 결과만 볼 수 있습니다.');
      return supplierVisibleProposal(currentProposal);
    },
  };
}
