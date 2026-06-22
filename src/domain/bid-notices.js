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
    `Transition from ${notice.status} to ${nextStatus} is not allowed.`
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
  assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_PUBLISH', 'Only buyers can publish notices.');
  assertRule(actor.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', 'Buyers can publish only their own company notices.');
  assertRule(buyerCompany.type === CompanyType.Buyer, 'BUYER_COMPANY_REQUIRED', 'Only buyer companies can publish notices.');
  assertRule(buyerCompany.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', 'Buyer company must be approved before publishing.');
  assertRule(
    Boolean(notice.title && notice.category && notice.requirements && notice.deadlineAt && notice.evaluationCriteria),
    'NOTICE_INCOMPLETE',
    'A notice cannot be published without a title, category, requirements, deadline, and evaluation criteria.'
  );
  assertRule(new Date(notice.deadlineAt).getTime() > new Date(now).getTime(), 'DEADLINE_PAST', 'Deadline must be in the future.');

  return transitionNotice(notice, NoticeStatus.Published, now);
}

export function closeNotice({ notice, now = new Date().toISOString() }) {
  return transitionNotice(notice, NoticeStatus.Closed, now);
}

export function startEvaluation({ notice, now = new Date().toISOString() }) {
  return transitionNotice(notice, NoticeStatus.Evaluating, now);
}
