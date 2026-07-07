import { ProposalStatus } from './constants.js';

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value));
}

function companyById(companies, companyId) {
  return companies.find((company) => company.id === companyId) || { name: '참여 업체', contactName: '담당자' };
}

function contactLine(company) {
  return company.contactName ? `${company.name} ${company.contactName}님` : `${company.name} 담당자님`;
}

export function createInvitationMailTemplate(notice) {
  return {
    subject: `[입찰 안내] ${notice.title}`,
    body: [
      '안녕하세요.',
      '',
      `아래 공고는 현재 입찰중입니다.`,
      '',
      `공고명: ${notice.title}`,
      `분야: ${notice.category}`,
      `공고 기간: ${formatDateTime(notice.startsAt)} ~ ${formatDateTime(notice.deadlineAt)}`,
      `제안요청서: ${notice.requestFile?.name || '입찰 사이트에서 다운로드'}`,
      '',
      '입찰 사이트에 방문하여 공고 내용을 확인하고 제안요청서를 다운로드한 뒤, 마감 전까지 제안서를 업로드해 주세요.',
      '',
      '본 메일은 Outlook에서 발송됩니다.',
      '감사합니다.',
    ].join('\n'),
  };
}

export function createResultMailTemplates({ notice, proposals, companies }) {
  const preferred = proposals
    .filter((proposal) => proposal.status === ProposalStatus.Selected)
    .map((proposal) => {
      const company = companyById(companies, proposal.supplierCompanyId);
      return {
        proposalId: proposal.id,
        companyId: company.id,
        companyName: company.name,
        subject: `[입찰 결과 안내] ${notice.title} 우선대상자 선정`,
        body: [
          `${contactLine(company)},`,
          '',
          `${notice.title} 공고 검토 결과 귀사가 우선대상자로 선정되었습니다.`,
          '후속 협의 일정과 필요 서류는 별도 안내드리겠습니다.',
          '',
          '참여해 주셔서 감사합니다.',
        ].join('\n'),
      };
    });

  const rejected = proposals
    .filter((proposal) => proposal.status === ProposalStatus.NotSelected)
    .map((proposal) => {
      const company = companyById(companies, proposal.supplierCompanyId);
      return {
        proposalId: proposal.id,
        companyId: company.id,
        companyName: company.name,
        subject: `[입찰 결과 안내] ${notice.title}`,
        body: [
          `${contactLine(company)},`,
          '',
          `${notice.title} 공고 검토 결과 아쉽게도 이번 입찰에서는 선정되지 않았습니다.`,
          '소중한 제안서를 제출해 주셔서 감사드리며, 다음 기회에 다시 함께하길 바랍니다.',
          '',
          '감사합니다.',
        ].join('\n'),
      };
    });

  return { preferred, rejected };
}
