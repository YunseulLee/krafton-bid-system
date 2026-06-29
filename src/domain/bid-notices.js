import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from './constants.js';
import { assertRule } from './errors.js';

const allowedTransitions = new Map([
  [NoticeStatus.Draft, new Set([NoticeStatus.Published])],
  [NoticeStatus.Published, new Set([NoticeStatus.Closed, NoticeStatus.Hidden])],
  [NoticeStatus.Hidden, new Set([NoticeStatus.Published])],
  [NoticeStatus.Closed, new Set([NoticeStatus.Evaluating])],
  [NoticeStatus.Evaluating, new Set([NoticeStatus.Awarded])],
  [NoticeStatus.Awarded, new Set([NoticeStatus.Ended])],
]);

export function transitionNotice(notice, nextStatus, now = new Date().toISOString()) {
  const allowed = allowedTransitions.get(notice.status) || new Set();
  assertRule(
    allowed.has(nextStatus),
    'NOTICE_TRANSITION_BLOCKED',
    `${notice.status} 상태에서 ${nextStatus} 상태로 변경할 수 없습니다.`
  );

  return {
    ...notice,
    status: nextStatus,
    updatedAt: now,
    publishedAt: nextStatus === NoticeStatus.Published ? now : notice.publishedAt,
    closedAt: nextStatus === NoticeStatus.Closed ? now : notice.closedAt,
    awardedAt: nextStatus === NoticeStatus.Awarded ? now : notice.awardedAt,
  };
}

export function publishNotice({ notice, actor, buyerCompany, now = new Date().toISOString() }) {
  assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_PUBLISH', '구매자만 공고를 게시할 수 있습니다.');
  assertRule(actor.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', '구매자는 자기 회사 공고만 게시할 수 있습니다.');
  assertRule(buyerCompany.type === CompanyType.Buyer, 'BUYER_COMPANY_REQUIRED', '구매 업체만 공고를 게시할 수 있습니다.');
  assertRule(buyerCompany.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', '공고를 게시하려면 구매 업체 승인이 필요합니다.');
  assertRule(
    Boolean(notice.title && notice.category && notice.requirements && notice.deadlineAt),
    'NOTICE_INCOMPLETE',
    '제목, 카테고리, 요구사항, 마감일이 있어야 공고를 게시할 수 있습니다.'
  );
  assertRule(new Date(notice.deadlineAt).getTime() > new Date(now).getTime(), 'DEADLINE_PAST', '마감일은 현재 시점 이후여야 합니다.');

  return transitionNotice(notice, NoticeStatus.Published, now);
}

export function closeNotice({ notice, now = new Date().toISOString() }) {
  return transitionNotice(notice, NoticeStatus.Closed, now);
}

export function startEvaluation({ notice, now = new Date().toISOString() }) {
  return transitionNotice(notice, NoticeStatus.Evaluating, now);
}
