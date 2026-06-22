import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from '../domain/constants.js';
import { createBidNotice, createCompany, createMember, createReport } from '../domain/model.js';

export function createSeedData() {
  const buyerCompany = createCompany({
    id: 'company-buyer-1',
    name: 'Han River Buyers',
    businessRegistrationNumber: '101-81-00001',
    type: CompanyType.Buyer,
    status: CompanyStatus.Approved,
    contactName: 'Kim Buyer',
    contactEmail: 'buyer@example.com',
  });
  const supplierCompany = createCompany({
    id: 'company-supplier-1',
    name: 'Seoul Supplier Works',
    businessRegistrationNumber: '201-81-00002',
    type: CompanyType.Supplier,
    status: CompanyStatus.Approved,
    contactName: 'Lee Supplier',
    contactEmail: 'supplier@example.com',
  });
  const pendingSupplierCompany = createCompany({
    id: 'company-supplier-pending',
    name: 'Pending Supplier Lab',
    businessRegistrationNumber: '301-81-00003',
    type: CompanyType.Supplier,
    status: CompanyStatus.Pending,
    contactName: 'Choi Pending',
    contactEmail: 'pending@example.com',
  });

  return {
    companies: [
      buyerCompany,
      supplierCompany,
      pendingSupplierCompany,
    ],
    members: [
      createMember({ id: 'member-buyer-1', name: 'Kim Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: buyerCompany.id }),
      createMember({ id: 'member-supplier-1', name: 'Lee Supplier', email: 'supplier@example.com', role: MemberRole.Supplier, companyId: supplierCompany.id }),
      createMember({ id: 'member-operator-1', name: 'Park Operator', email: 'operator@example.com', role: MemberRole.Operator }),
    ],
    notices: [
      createBidNotice({
        id: 'notice-seed-1',
        buyerCompanyId: buyerCompany.id,
        title: 'Office Network Upgrade',
        category: 'IT',
        summary: 'Upgrade office network devices.',
        requirements: 'Replace switches, install access points, and document topology.',
        budgetMin: 8000000,
        budgetMax: 12000000,
        deadlineAt: '2026-07-05T00:00:00.000Z',
        evaluationCriteria: 'Price 40, technical 40, schedule 20',
        attachmentRequirements: ['Company profile', 'Reference projects'],
        status: NoticeStatus.Published,
        createdByMemberId: 'member-buyer-1',
        publishedAt: '2026-06-22T00:00:00.000Z',
      }),
    ],
    savedNotices: [],
    proposals: [],
    evaluations: [],
    reports: [
      createReport({ id: 'report-seed-1', reporterMemberId: 'member-supplier-1', targetType: 'BidNotice', targetId: 'notice-seed-1', reason: 'Need operator review of budget range.' }),
    ],
    activity: [],
  };
}
