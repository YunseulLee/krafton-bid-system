import { mapCompanyFromProfile, mapEvaluationRow, mapNoticeRow, mapProfileRow, mapProposalRow } from './supabase-mappers.js';
import { createProposalFilePath, createRfpFilePath, createTimestamp } from './supabase-storage-paths.js';

function assertSupabaseResult(result, fallbackMessage) {
  if (result?.error) {
    throw new Error(result.error.message || fallbackMessage);
  }
  return result?.data;
}

async function createSignedUrl(supabase, bucket, path) {
  if (!path) return '';
  const result = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  if (result.error) return '';
  return result.data?.signedUrl || '';
}

function createRandomId() {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') {
    throw new Error('브라우저에서 안전한 UUID를 생성할 수 없습니다.');
  }
  return randomUUID.call(globalThis.crypto);
}

const SUPPLIER_LOGIN_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export function createSupplierLoginExpiresAt(now = new Date()) {
  return new Date(new Date(now).getTime() + SUPPLIER_LOGIN_LIFETIME_MS).toISOString();
}

export function createSupabaseBidStore({ supabase, nowProvider = () => new Date() }) {
  async function loadProfile(userId) {
    const result = await supabase
      .from('profiles')
      .select('id,email,name,company_name,role,login_expires_at')
      .eq('id', userId)
      .single();
    return mapProfileRow(assertSupabaseResult(result, '프로필을 불러오지 못했습니다.'));
  }

  async function expireSignedInSupplier(member) {
    if (member.role !== 'Supplier' || !member.loginExpiresAt) return null;
    if (new Date(member.loginExpiresAt).getTime() > nowProvider().getTime()) return null;
    if (supabase.auth.signOut) await supabase.auth.signOut();
    return {
      status: 'expired',
      message: '계정 사용기간이 만료되었습니다. 다시 가입해 주세요.',
    };
  }

  return {
    async loadSession() {
      const result = await supabase.auth.getUser();
      assertSupabaseResult(result, '로그인 정보를 확인하지 못했습니다.');
      const user = result.data?.user;
      if (!user) return { status: 'signed_out' };
      const member = await loadProfile(user.id);
      const expiredSession = await expireSignedInSupplier(member);
      if (expiredSession) return expiredSession;
      return { status: 'signed_in', member };
    },

    async signIn(email, password) {
      const result = await supabase.auth.signInWithPassword({ email, password });
      assertSupabaseResult(result, '로그인에 실패했습니다.');
      const session = await this.loadSession();
      if (session.status === 'expired') throw new Error(session.message);
      return session;
    },

    async signUpSupplier(email, password) {
      const loginExpiresAt = createSupplierLoginExpiresAt(nowProvider());
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'supplier',
            login_expires_at: loginExpiresAt,
          },
        },
      });
      assertSupabaseResult(result, '가입에 실패했습니다.');
      return { email, loginExpiresAt };
    },

    async signOut() {
      const result = await supabase.auth.signOut();
      assertSupabaseResult(result, '로그아웃에 실패했습니다.');
      return { status: 'signed_out' };
    },

    async loadDashboard(member) {
      const noticesTable = member.role === 'Operator' ? 'bid_notices' : 'participant_bid_notices';
      const noticesResult = await supabase
        .from(noticesTable)
        .select('*')
        .order('deadline_at', { ascending: true });
      const noticeRows = assertSupabaseResult(noticesResult, '공고 목록을 불러오지 못했습니다.') || [];
      const notices = [];
      for (const row of noticeRows) {
        const rfpUrl = row.rfp_file_path ? await createSignedUrl(supabase, 'rfp-files', row.rfp_file_path) : '';
        notices.push(mapNoticeRow({ ...row, rfp_download_url: rfpUrl }));
      }

      const proposalTable = member.role === 'Operator' ? 'proposals' : 'participant_proposals';
      const proposalsResult = member.role === 'Operator'
        ? await supabase.from(proposalTable).select('*').order('submitted_at', { ascending: true })
        : await supabase.from(proposalTable).select('*').eq('supplier_id', member.id).order('submitted_at', { ascending: true });
      const proposalRows = assertSupabaseResult(proposalsResult, '제안서 목록을 불러오지 못했습니다.') || [];
      const proposals = [];
      for (const row of proposalRows) {
        if (member.role === 'Operator') {
          const fileUrl = row.file_path ? await createSignedUrl(supabase, 'proposal-files', row.file_path) : '';
          proposals.push(mapProposalRow({ ...row, file_download_url: fileUrl }));
        } else {
          proposals.push(mapProposalRow(row, { participantSafe: true }));
        }
      }

      const evaluations = member.role === 'Operator'
        ? (assertSupabaseResult(await supabase.from('evaluations').select('*'), '평가 목록을 불러오지 못했습니다.') || []).map(mapEvaluationRow)
        : [];

      const companies = [mapCompanyFromProfile(member)];
      return {
        members: [member],
        companies,
        notices,
        proposals,
        evaluations,
        activity: [],
        savedNotices: [],
        reports: [],
      };
    },

    async createOperatorNotice(member, input) {
      const timestamp = createTimestamp(nowProvider());
      const noticeId = createRandomId();
      const rfpPath = createRfpFilePath({ noticeId, fileName: input.requestFile.name, timestamp });
      const upload = await supabase.storage.from('rfp-files').upload(rfpPath, input.requestFile, { upsert: false });
      assertSupabaseResult(upload, '제안요청서 업로드에 실패했습니다.');

      const insert = await supabase
        .from('bid_notices')
        .insert({
          id: noticeId,
          title: input.title,
          category: input.category,
          summary: input.summary,
          starts_at: input.startsAt,
          deadline_at: input.deadlineAt,
          status: 'published',
          rfp_file_path: rfpPath,
          rfp_file_name: input.requestFile.name,
          rfp_file_size: input.requestFile.size || 0,
          created_by: member.id,
        })
        .select()
        .single();
      return mapNoticeRow(assertSupabaseResult(insert, '공고 등록에 실패했습니다.'));
    },

    async replaceNoticeRequestFile(member, noticeId, requestFile) {
      if (member.role !== 'Operator') {
        throw new Error('운영자만 제안요청서를 교체할 수 있습니다.');
      }
      const now = nowProvider();
      const timestamp = createTimestamp(now);
      const currentNotice = assertSupabaseResult(
        await supabase
          .from('bid_notices')
          .select('rfp_file_path')
          .eq('id', noticeId)
          .single(),
        '기존 제안요청서를 확인하지 못했습니다.'
      );
      const rfpPath = createRfpFilePath({ noticeId, fileName: requestFile.name, timestamp });
      const upload = await supabase.storage.from('rfp-files').upload(rfpPath, requestFile, { upsert: false });
      assertSupabaseResult(upload, '제안요청서 업로드에 실패했습니다.');

      const update = await supabase
        .from('bid_notices')
        .update({
          rfp_file_path: rfpPath,
          rfp_file_name: requestFile.name,
          rfp_file_size: requestFile.size || 0,
          updated_at: now.toISOString(),
        })
        .eq('id', noticeId)
        .select()
        .single();
      const notice = mapNoticeRow(assertSupabaseResult(update, '제안요청서 교체에 실패했습니다.'));
      if (currentNotice?.rfp_file_path && currentNotice.rfp_file_path !== rfpPath) {
        const remove = await supabase.storage.from('rfp-files').remove([currentNotice.rfp_file_path]);
        assertSupabaseResult(remove, '이전 제안요청서 삭제에 실패했습니다.');
      }
      return notice;
    },

    async cleanupExpiredProposalRevisionFiles({ retentionDays = 30 } = {}) {
      const revisions = assertSupabaseResult(
        await supabase.rpc('list_expired_proposal_revision_files', { retention_days: retentionDays }),
        '삭제 대상 제안서 이력을 확인하지 못했습니다.'
      ) || [];
      const paths = revisions.map((revision) => revision.file_path).filter(Boolean);
      const ids = revisions.map((revision) => revision.id).filter(Boolean);
      if (paths.length === 0) return { deletedCount: 0 };

      const remove = await supabase.storage.from('proposal-files').remove(paths);
      assertSupabaseResult(remove, '이전 제안서 파일 삭제에 실패했습니다.');
      assertSupabaseResult(
        await supabase
          .from('proposal_file_revisions')
          .update({ storage_deleted_at: nowProvider().toISOString() })
          .in('id', ids),
        '삭제된 제안서 이력 표시를 저장하지 못했습니다.'
      );
      return { deletedCount: paths.length };
    },

    async submitProposalFile(member, noticeId, file) {
      const now = nowProvider();
      const timestamp = createTimestamp(now);
      const filePath = createProposalFilePath({ noticeId, supplierId: member.id, fileName: file.name, timestamp });
      const existingProposal = assertSupabaseResult(
        await supabase
          .from('participant_proposals')
          .select('id')
          .eq('notice_id', noticeId)
          .eq('supplier_id', member.id)
          .maybeSingle(),
        '기존 제안서 제출 여부를 확인하지 못했습니다.'
      );
      const upload = await supabase.storage.from('proposal-files').upload(filePath, file, { upsert: false });
      assertSupabaseResult(upload, '제안서 업로드에 실패했습니다.');

      const payload = {
        file_path: filePath,
        file_name: file.name,
        file_size: file.size || 0,
        status: 'submitted',
        updated_at: now.toISOString(),
      };
      const save = existingProposal?.id
        ? await supabase
          .from('proposals')
          .update(payload)
          .eq('id', existingProposal.id)
          .select()
          .single()
        : await supabase
          .from('proposals')
          .insert({
            notice_id: noticeId,
            supplier_id: member.id,
            supplier_company_name: member.companyName,
            ...payload,
          })
          .select()
          .single();
      return mapProposalRow(assertSupabaseResult(save, '제안서 제출에 실패했습니다.'), { participantSafe: true });
    },

    async evaluateSubmission(member, proposalId, input) {
      const proposal = assertSupabaseResult(
        await supabase.from('proposals').select('notice_id').eq('id', proposalId).single(),
        '제안서를 찾지 못했습니다.'
      );
      const payload = {
        proposal_id: proposalId,
        notice_id: proposal.notice_id,
        evaluator_id: member.id,
        score: input.score,
        note: input.note || '',
      };
      const existingEvaluation = assertSupabaseResult(
        await supabase.from('evaluations').select('id').eq('proposal_id', proposalId).maybeSingle(),
        '평가 저장에 실패했습니다.'
      );
      const save = existingEvaluation?.id
        ? await supabase.from('evaluations').update(payload).eq('id', existingEvaluation.id).select().single()
        : await supabase.from('evaluations').insert(payload).select().single();
      return mapEvaluationRow(assertSupabaseResult(save, '평가 저장에 실패했습니다.'));
    },

    async selectPreferredProposal(proposalId, noticeId) {
      const proposals = assertSupabaseResult(
        await supabase.from('proposals').select('id').eq('notice_id', noticeId),
        '제출 업체를 확인하지 못했습니다.'
      ) || [];
      const evaluations = assertSupabaseResult(
        await supabase.from('evaluations').select('proposal_id').eq('notice_id', noticeId),
        '평가 목록을 확인하지 못했습니다.'
      ) || [];
      const evaluatedIds = new Set(evaluations.map((item) => item.proposal_id));
      if (proposals.length === 0 || !proposals.every((item) => evaluatedIds.has(item.id))) {
        throw new Error('모든 제출 업체의 평가를 저장한 뒤 우선대상자를 선택할 수 있습니다.');
      }

      const noticeUpdate = await supabase
        .from('bid_notices')
        .update({ preferred_proposal_id: proposalId })
        .eq('id', noticeId)
        .select()
        .single();
      assertSupabaseResult(noticeUpdate, '우선대상자 선택에 실패했습니다.');

      for (const proposal of proposals) {
        const status = proposal.id === proposalId ? 'selected' : 'not_selected';
        assertSupabaseResult(
          await supabase.from('proposals').update({ status }).eq('id', proposal.id),
          '제안서 결과 상태 저장에 실패했습니다.'
        );
      }
      return true;
    },

    async markResultNotificationComplete(noticeId) {
      const result = await supabase
        .from('bid_notices')
        .update({ result_notified_at: nowProvider().toISOString() })
        .eq('id', noticeId)
        .select()
        .single();
      return mapNoticeRow(assertSupabaseResult(result, '통보 완료 상태 저장에 실패했습니다.'));
    },
  };
}
