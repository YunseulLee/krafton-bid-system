import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from './constants.js';
import { assertRule } from './errors.js';

export function ensureActiveCompany(company) {
  assertRule(company.status !== CompanyStatus.Suspended, 'COMPANY_SUSPENDED', '정지된 업체는 새 거래 작업을 수행할 수 없습니다.');
  assertRule(company.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', '이 작업을 수행하려면 업체 승인이 필요합니다.');
  return true;
}

export function canManageNotice(actor, notice) {
  return actor.role === MemberRole.Buyer && actor.companyId === notice.buyerCompanyId;
}

export function canSubmitProposal({ actor, supplierCompany, notice, now }) {
  if (actor.role !== MemberRole.Supplier) return false;
  if (supplierCompany.type !== CompanyType.Supplier) return false;
  if (supplierCompany.status !== CompanyStatus.Approved) return false;
  if (actor.companyId !== supplierCompany.id) return false;
  if (notice.status !== NoticeStatus.Published) return false;
  if (notice.buyerCompanyId === supplierCompany.id) return false;
  return new Date(now).getTime() < new Date(notice.deadlineAt).getTime();
}

export function canViewProposal({ actor, notice, proposal }) {
  if (actor.role === MemberRole.Operator) return true;
  if (actor.role === MemberRole.Buyer) return actor.companyId === notice.buyerCompanyId;
  if (actor.role === MemberRole.Supplier) return actor.companyId === proposal.supplierCompanyId;
  return false;
}
