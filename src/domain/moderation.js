import { ActivityAction, CompanyStatus, MemberRole, NoticeStatus } from './constants.js';
import { assertRule } from './errors.js';
import { createActivityLog } from './model.js';
import { transitionNotice } from './bid-notices.js';

function assertOperator(actor) {
  assertRule(actor.role === MemberRole.Operator, 'ONLY_OPERATORS', 'Only operators can perform this moderation action.');
}

function activity({ actor, targetType, targetId, action, metadata, now }) {
  return createActivityLog({
    id: `${action}-${targetId}-${now}`,
    actorMemberId: actor.id,
    actorCompanyId: actor.companyId || null,
    targetType,
    targetId,
    action,
    metadata,
    createdAt: now,
  });
}

export function approveCompany({ company, actor, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    company: { ...company, status: CompanyStatus.Approved, updatedAt: now },
    activity: activity({ actor, targetType: 'Company', targetId: company.id, action: ActivityAction.CompanyApproved, metadata: {}, now }),
  };
}

export function suspendCompany({ company, actor, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    company: { ...company, status: CompanyStatus.Suspended, updatedAt: now },
    activity: activity({ actor, targetType: 'Company', targetId: company.id, action: ActivityAction.CompanySuspended, metadata: {}, now }),
  };
}

export function hideNotice({ notice, actor, reason, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    notice: transitionNotice(notice, NoticeStatus.Hidden, now),
    activity: activity({ actor, targetType: 'BidNotice', targetId: notice.id, action: ActivityAction.NoticeHidden, metadata: { reason }, now }),
  };
}

export function restoreNotice({ notice, actor, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    notice: transitionNotice(notice, NoticeStatus.Published, now),
    activity: activity({ actor, targetType: 'BidNotice', targetId: notice.id, action: ActivityAction.NoticeRestored, metadata: {}, now }),
  };
}

export function resolveReport({ report, actor, status, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    report: { ...report, status, updatedAt: now },
    activity: activity({ actor, targetType: 'Report', targetId: report.id, action: ActivityAction.ReportResolved, metadata: { status }, now }),
  };
}
