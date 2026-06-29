import { CompanyStatus, CompanyType, MemberRole, NoticeStatus, ProposalStatus } from '../domain/constants.js';
import { createBidNotice, createCompany, createMember, createProposal, createReport } from '../domain/model.js';

export function createSeedData() {
  const buyerCompany = createCompany({
    id: 'company-buyer-1',
    name: '한강구매 주식회사',
    businessRegistrationNumber: '101-81-00001',
    type: CompanyType.Buyer,
    status: CompanyStatus.Approved,
    contactName: '김구매',
    contactEmail: 'buyer@example.com',
  });
  const supplierCompany = createCompany({
    id: 'company-supplier-1',
    name: '서울공급웍스',
    businessRegistrationNumber: '201-81-00002',
    type: CompanyType.Supplier,
    status: CompanyStatus.Approved,
    contactName: '이공급',
    contactEmail: 'supplier@example.com',
  });
  const pendingSupplierCompany = createCompany({
    id: 'company-supplier-pending',
    name: '심사대기 공급랩',
    businessRegistrationNumber: '301-81-00003',
    type: CompanyType.Supplier,
    status: CompanyStatus.Pending,
    contactName: '최대기',
    contactEmail: 'pending@example.com',
  });

  return {
    companies: [
      buyerCompany,
      supplierCompany,
      pendingSupplierCompany,
    ],
    members: [
      createMember({ id: 'member-buyer-1', name: '김구매', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: buyerCompany.id }),
      createMember({ id: 'member-supplier-1', name: '이공급', email: 'supplier@example.com', role: MemberRole.Supplier, companyId: supplierCompany.id }),
      createMember({ id: 'member-operator-1', name: '박운영', email: 'operator@example.com', role: MemberRole.Operator }),
    ],
    notices: [
      createBidNotice({
        id: 'notice-seed-1',
        buyerCompanyId: buyerCompany.id,
        title: '사무실 네트워크 고도화',
        category: '정보기술',
        summary: '사무실 네트워크 장비와 무선 환경을 개선합니다.',
        requirements: '스위치 교체, 무선 AP 설치, 네트워크 구성도 문서화를 포함합니다.',
        budgetMin: 8000000,
        budgetMax: 12000000,
        startsAt: '2026-06-22T00:00:00.000Z',
        deadlineAt: '2026-07-05T09:00:00.000Z',
        requestFile: {
          name: '사무실_네트워크_제안요청서.pdf',
          size: 348160,
          type: 'application/pdf',
          lastModified: 1782086400000,
        },
        attachmentRequirements: ['회사 소개서', '유사 수행 실적'],
        status: NoticeStatus.Published,
        createdByMemberId: 'member-buyer-1',
        publishedAt: '2026-06-22T00:00:00.000Z',
      }),
      createBidNotice({
        id: 'notice-ended-1',
        buyerCompanyId: 'platform-operator',
        title: '완료된 보안 점검 용역',
        category: '시설관리',
        summary: '운영자가 마감 이후 제출 파일을 평가하는 샘플 공고입니다.',
        requirements: '보안 점검 계획과 산출물 예시를 포함합니다.',
        startsAt: '2026-06-01T00:00:00.000Z',
        deadlineAt: '2026-06-10T09:00:00.000Z',
        requestFile: {
          name: '보안점검_제안요청서.pdf',
          size: 266240,
          type: 'application/pdf',
          lastModified: 1780272000000,
        },
        attachmentRequirements: ['제안서 PDF'],
        status: NoticeStatus.Published,
        createdByMemberId: 'member-operator-1',
        publishedAt: '2026-06-01T00:00:00.000Z',
      }),
    ],
    savedNotices: [],
    proposals: [
      createProposal({
        id: 'proposal-ended-1',
        bidNoticeId: 'notice-ended-1',
        supplierCompanyId: supplierCompany.id,
        submittedByMemberId: 'member-supplier-1',
        price: null,
        deliverySchedule: '',
        proposalText: '제안서 파일로 제출했습니다.',
        file: {
          name: '네트워크_제안서.pdf',
          size: 524288,
          type: 'application/pdf',
          lastModified: 1780800000000,
        },
        status: ProposalStatus.Submitted,
        submittedAt: '2026-06-05T10:00:00.000Z',
      }),
    ],
    evaluations: [],
    reports: [
      createReport({ id: 'report-seed-1', reporterMemberId: 'member-supplier-1', targetType: 'BidNotice', targetId: 'notice-seed-1', reason: '예산 범위에 대한 운영자 검토가 필요합니다.' }),
    ],
    activity: [],
  };
}
