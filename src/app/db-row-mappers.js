import { CompanyStatus, CompanyType, MemberRole, NoticeStatus, ProposalStatus } from '../domain/constants.js';

const roleMap = {
  supplier: MemberRole.Supplier,
  operator: MemberRole.Operator,
};

const noticeStatusMap = {
  published: NoticeStatus.Published,
  ended: NoticeStatus.Ended,
};

const proposalStatusMap = {
  submitted: ProposalStatus.Submitted,
  selected: ProposalStatus.Selected,
  not_selected: ProposalStatus.NotSelected,
};

export function mapProfileRow(row) {
  const profile = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: roleMap[row.role] || row.role,
    companyId: `company-${row.id}`,
    companyName: row.company_name,
  };
  if (row.login_expires_at) profile.loginExpiresAt = row.login_expires_at;
  return profile;
}

export function mapCompanyFromProfile(profile) {
  return {
    id: profile.companyId,
    name: profile.companyName,
    type: profile.role === MemberRole.Operator ? CompanyType.Buyer : CompanyType.Supplier,
    status: CompanyStatus.Approved,
  };
}

export function mapNoticeRow(row) {
  return {
    id: row.id,
    buyerCompanyId: 'platform-operator',
    title: row.title,
    category: row.category,
    summary: row.summary,
    requirements: row.summary,
    startsAt: row.starts_at,
    deadlineAt: row.deadline_at,
    requestFile: {
      name: row.rfp_file_name,
      size: row.rfp_file_size || 0,
      type: 'application/octet-stream',
      url: row.rfp_download_url || '',
    },
    attachmentRequirements: ['제안서 파일'],
    status: noticeStatusMap[row.status] || row.status,
    createdByMemberId: row.created_by || null,
    awardedProposalId: row.preferred_proposal_id || null,
    awardReason: '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.created_at || null,
    closedAt: null,
    awardedAt: null,
    resultNotifiedAt: row.result_notified_at || null,
  };
}

export function mapProposalRow(row, { participantSafe = false } = {}) {
  return {
    id: row.id,
    bidNoticeId: row.notice_id,
    supplierCompanyId: `company-${row.supplier_id}`,
    submittedByMemberId: row.supplier_id,
    supplierCompanyName: row.supplier_company_name || '',
    price: null,
    deliverySchedule: '',
    proposalText: '제안서 파일로 제출했습니다.',
    attachmentIds: [],
    file: {
      name: row.file_name,
      size: row.file_size || 0,
      type: 'application/octet-stream',
      url: participantSafe ? '' : (row.file_download_url || ''),
    },
    status: participantSafe ? ProposalStatus.Submitted : (proposalStatusMap[row.status] || row.status),
    submittedAt: row.submitted_at,
    withdrawnAt: null,
    createdAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

export function mapEvaluationRow(row) {
  return {
    id: row.id,
    bidNoticeId: row.notice_id,
    proposalId: row.proposal_id,
    evaluatorMemberId: row.evaluator_id,
    priceScore: row.score,
    technicalScore: 0,
    scheduleScore: 0,
    note: row.note || '',
    totalScore: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
