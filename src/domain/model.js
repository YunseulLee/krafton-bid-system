import { CompanyStatus, MemberStatus, NoticeStatus, ProposalStatus, ReportStatus } from './constants.js';

export function createCompany(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    businessRegistrationNumber: input.businessRegistrationNumber,
    type: input.type,
    status: input.status || CompanyStatus.Pending,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createMember(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    role: input.role,
    companyId: input.companyId || null,
    status: input.status || MemberStatus.Active,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createBidNotice(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    buyerCompanyId: input.buyerCompanyId,
    title: input.title,
    category: input.category,
    summary: input.summary || '',
    requirements: input.requirements,
    budgetMin: input.budgetMin || null,
    budgetMax: input.budgetMax || null,
    deadlineAt: input.deadlineAt,
    evaluationCriteria: input.evaluationCriteria,
    attachmentRequirements: input.attachmentRequirements || [],
    status: input.status || NoticeStatus.Draft,
    createdByMemberId: input.createdByMemberId,
    awardedProposalId: input.awardedProposalId || null,
    awardReason: input.awardReason || '',
    createdAt: now,
    updatedAt: input.updatedAt || now,
    publishedAt: input.publishedAt || null,
    closedAt: input.closedAt || null,
    awardedAt: input.awardedAt || null,
  };
}

export function createProposal(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    bidNoticeId: input.bidNoticeId,
    supplierCompanyId: input.supplierCompanyId,
    price: input.price,
    deliverySchedule: input.deliverySchedule,
    proposalText: input.proposalText,
    attachmentIds: input.attachmentIds || [],
    status: input.status || ProposalStatus.Draft,
    submittedAt: input.submittedAt || null,
    withdrawnAt: input.withdrawnAt || null,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createEvaluation(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    bidNoticeId: input.bidNoticeId,
    proposalId: input.proposalId,
    evaluatorMemberId: input.evaluatorMemberId,
    priceScore: input.priceScore,
    technicalScore: input.technicalScore,
    scheduleScore: input.scheduleScore,
    note: input.note || '',
    totalScore: input.totalScore,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createActivityLog(input) {
  return {
    id: input.id,
    actorMemberId: input.actorMemberId,
    actorCompanyId: input.actorCompanyId || null,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    metadata: input.metadata || {},
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function createReport(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    reporterMemberId: input.reporterMemberId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    status: input.status || ReportStatus.Open,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}
