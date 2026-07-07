import { mapCompanyFromProfile, mapEvaluationRow, mapNoticeRow, mapProfileRow, mapProposalRow } from './db-row-mappers.js';

function assertApiResult(result, fallbackMessage) {
  if (result?.error) {
    throw new Error(result.error.message || fallbackMessage);
  }
  return result?.data;
}

function mapMember(row) {
  if (!row) return null;
  if (row.companyId && row.companyName) return row;
  return mapProfileRow(row);
}

function mapNotice(item) {
  if (!item) return null;
  if (item.startsAt && item.deadlineAt) return item;
  return mapNoticeRow(item);
}

function mapProposal(item, options) {
  if (!item) return null;
  if (item.bidNoticeId) {
    if (!options?.participantSafe) return item;
    return {
      ...item,
      file: item.file ? { ...item.file, url: '' } : item.file,
      status: 'Submitted',
    };
  }
  return mapProposalRow(item, options);
}

function mapEvaluation(item) {
  if (!item) return null;
  if (item.proposalId) return item;
  return mapEvaluationRow(item);
}

function isOperator(member) {
  return member?.role === 'Operator';
}

function isOwnProposal(proposal, member) {
  if (!proposal || !member) return false;
  return proposal.submittedByMemberId === member.id
    || proposal.supplierCompanyId === member.companyId;
}

function appendFilePayload(form, key, file) {
  if (!file) return;
  form.append(key, file);
  form.append(`${key}Name`, file.name || '');
  form.append(`${key}Size`, String(file.size || 0));
}

export function createApiBidStore({ api }) {
  return {
    async loadSession() {
      const data = assertApiResult(await api.get('/session'), '로그인 정보를 확인하지 못했습니다.');
      if (!data?.member) return data || { status: 'signed_out' };
      return {
        ...data,
        member: mapMember(data.member),
      };
    },

    async signIn(email, password) {
      const data = assertApiResult(
        await api.post('/auth/login', { email, password }),
        '로그인에 실패했습니다.'
      );
      if (data?.member) {
        return {
          ...data,
          member: mapMember(data.member),
        };
      }
      return this.loadSession();
    },

    async signUpSupplier(email, password) {
      return assertApiResult(
        await api.post('/auth/suppliers', { email, password }),
        '가입에 실패했습니다.'
      );
    },

    async signOut() {
      assertApiResult(await api.post('/auth/logout'), '로그아웃에 실패했습니다.');
      return { status: 'signed_out' };
    },

    async loadDashboard(member) {
      const data = assertApiResult(await api.get('/dashboard'), '대시보드를 불러오지 못했습니다.') || {};
      const mappedMember = mapMember(data.member || member);
      const operator = isOperator(mappedMember);
      const proposals = (data.proposals || [])
        .map((proposal) => mapProposal(proposal, { participantSafe: !operator }))
        .filter((proposal) => operator || isOwnProposal(proposal, mappedMember));
      return {
        members: operator
          ? (data.members || [mappedMember]).filter(Boolean).map(mapMember)
          : [mappedMember].filter(Boolean),
        companies: operator
          ? (data.companies || (mappedMember ? [mapCompanyFromProfile(mappedMember)] : []))
          : (mappedMember ? [mapCompanyFromProfile(mappedMember)] : []),
        notices: (data.notices || []).map(mapNotice),
        proposals,
        evaluations: operator ? (data.evaluations || []).map(mapEvaluation) : [],
        activity: operator ? (data.activity || []) : [],
        savedNotices: data.savedNotices || [],
        reports: operator ? (data.reports || []) : [],
      };
    },

    async createOperatorNotice(member, input) {
      const form = new FormData();
      form.append('title', input.title);
      form.append('category', input.category);
      form.append('summary', input.summary);
      form.append('startsAt', input.startsAt);
      form.append('deadlineAt', input.deadlineAt);
      appendFilePayload(form, 'requestFile', input.requestFile);
      return mapNotice(assertApiResult(await api.post('/notices', form), '공고 등록에 실패했습니다.'));
    },

    async replaceNoticeRequestFile(member, noticeId, requestFile) {
      const form = new FormData();
      appendFilePayload(form, 'requestFile', requestFile);
      return mapNotice(assertApiResult(
        await api.put(`/notices/${encodeURIComponent(noticeId)}/request-file`, form),
        '제안요청서 교체에 실패했습니다.'
      ));
    },

    async cleanupExpiredSupplierAccounts() {
      return assertApiResult(
        await api.post('/maintenance/supplier-accounts/cleanup'),
        '만료된 입찰자 계정 삭제에 실패했습니다.'
      );
    },

    async submitProposalFile(member, noticeId, file) {
      const form = new FormData();
      appendFilePayload(form, 'proposalFile', file);
      return mapProposal(assertApiResult(
        await api.post(`/notices/${encodeURIComponent(noticeId)}/proposals`, form),
        '제안서 제출에 실패했습니다.'
      ), { participantSafe: true });
    },

    async evaluateSubmission(member, proposalId, input) {
      return mapEvaluation(assertApiResult(
        await api.put(`/proposals/${encodeURIComponent(proposalId)}/evaluation`, {
          score: input.score,
          note: input.note || '',
        }),
        '평가 저장에 실패했습니다.'
      ));
    },

    async selectPreferredProposal(proposalId, noticeId) {
      assertApiResult(
        await api.post(`/notices/${encodeURIComponent(noticeId)}/preferred-proposal`, { proposalId }),
        '우선대상자 선택에 실패했습니다.'
      );
      return true;
    },

    async markResultNotificationComplete(noticeId) {
      return mapNotice(assertApiResult(
        await api.post(`/notices/${encodeURIComponent(noticeId)}/result-notification`, {}),
        '통보 완료 상태 저장에 실패했습니다.'
      ));
    },
  };
}
