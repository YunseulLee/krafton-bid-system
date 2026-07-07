import { MemberRole, NoticeStatus } from '../domain/constants.js';
import { createInvitationMailTemplate, createResultMailTemplates } from '../domain/outlook-mail-templates.js';

const roleLabels = {
  [MemberRole.Buyer]: '구매자',
  [MemberRole.Supplier]: '입찰자',
  [MemberRole.Operator]: '운영자',
};

const statusLabels = {
  Draft: '작성중',
  Published: '입찰중',
  Closed: '마감됨',
  Evaluating: '평가중',
  Awarded: '낙찰',
  Ended: '종료',
  Hidden: '숨김',
  Submitted: '제출됨',
  Withdrawn: '철회됨',
  Selected: '선정',
  NotSelected: '미선정',
  Pending: '심사중',
  Approved: '승인됨',
  Suspended: '정지됨',
  Open: '접수됨',
  Resolved: '처리됨',
  Dismissed: '기각됨',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function findMember(state, memberId) {
  return state.members.find((member) => member.id === memberId);
}

function companyName(state, companyId, member = null) {
  return state.companies.find((company) => company.id === companyId)?.name || member?.companyName || '플랫폼';
}

function labelRole(role) {
  return roleLabels[role] || role;
}

function labelStatus(status) {
  return statusLabels[status] || status;
}

function renderHeader(title, member, state) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(companyName(state, member.companyId, member))}</p>
        <h1>${title}</h1>
      </div>
      <span class="role-pill">${escapeHtml(labelRole(member.role))}</span>
    </header>
  `;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value));
}

function formatFileSize(size) {
  if (!size) return '0 KB';
  return `${Math.ceil(size / 1024).toLocaleString('ko-KR')} KB`;
}

function isNoticeOpen(notice, now) {
  const currentTime = new Date(now).getTime();
  const startsAt = notice.startsAt ? new Date(notice.startsAt).getTime() : Number.NEGATIVE_INFINITY;
  const deadlineAt = new Date(notice.deadlineAt).getTime();
  return notice.status === NoticeStatus.Published && startsAt <= currentTime && currentTime < deadlineAt;
}

function hasNoticeEnded(notice, now) {
  return new Date(now).getTime() >= new Date(notice.deadlineAt).getTime();
}

function findSelectedNotice(state, selectedNoticeId) {
  return state.notices.find((notice) => notice.id === selectedNoticeId) || state.notices[0] || null;
}

function hasPreferredProposal(state, noticeId) {
  return state.proposals.some((proposal) => proposal.bidNoticeId === noticeId && proposal.status === 'Selected');
}

function noticeWorkflowLabel(state, notice, now) {
  if (!notice) return '';
  if (notice.resultNotifiedAt) return '통보 완료';
  if (hasPreferredProposal(state, notice.id)) return '결과 통보 대기';
  if (hasNoticeEnded(notice, now)) return '평가중';
  if (isNoticeOpen(notice, now)) return '입찰중';
  return labelStatus(notice.status);
}

function proposalResultLabel(proposal) {
  if (proposal.status === 'Selected') return '우선대상자';
  if (proposal.status === 'NotSelected') return '탈락자';
  return '';
}

function hasEvaluation(state, proposalId) {
  return state.evaluations.some((item) => item.proposalId === proposalId);
}

function templateId(prefix, noticeId, suffix) {
  return `${prefix}-${noticeId}-${suffix}`.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
}

function requestFileHref(notice) {
  const file = notice.requestFile;
  if (!file?.name) return '';
  if (file.url) return file.url;
  const content = [
    `공고명: ${notice.title}`,
    `제안요청서 파일명: ${file.name}`,
    '실제 운영 환경에서는 운영자가 업로드한 원본 파일이 제공됩니다.',
  ].join('\n');
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
}

function proposalFileHref(proposal) {
  const file = proposal.file;
  if (!file?.name) return '';
  if (file.url) return file.url;
  const content = [
    `제안서 파일명: ${file.name}`,
    `제출 ID: ${proposal.id}`,
    '실제 운영 환경에서는 입찰 참여자가 업로드한 원본 파일이 제공됩니다.',
  ].join('\n');
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
}

function renderRequestFile(notice) {
  const file = notice.requestFile;
  if (!file?.name) {
    return '<p class="muted">등록된 제안요청서가 없습니다.</p>';
  }

  return `
    <div class="request-file">
      <div>
        <strong>제안요청서</strong>
        <span>${escapeHtml(file.name)} · ${escapeHtml(formatFileSize(file.size))}</span>
      </div>
      <a class="download-link" href="${escapeHtml(requestFileHref(notice))}" download="${escapeHtml(file.name)}">제안요청서 다운로드</a>
    </div>
  `;
}

function renderRequestFileReplacement(notice, { canReplace = false } = {}) {
  if (!notice?.requestFile?.name || !canReplace) return '';

  return `
    <div class="upload-box">
      <h3>제안요청서 교체</h3>
      <label>교체 파일
        <input type="file" data-rfp-file="${escapeHtml(notice.id)}">
      </label>
      <button data-action="replace-rfp-file" data-notice-id="${escapeHtml(notice.id)}">제안요청서 교체</button>
      <p class="muted">입찰 참여자는 최신 제안요청서만 다운로드합니다. 교체된 원본 파일은 보관 이력으로 남습니다.</p>
    </div>
  `;
}

function renderTemplateBlock({ title, subject, body, idPrefix }) {
  const subjectId = `${idPrefix}-subject`;
  const bodyId = `${idPrefix}-body`;
  return `
    <div class="template-block">
      <h3>${escapeHtml(title)}</h3>
      <label>메일 제목
        <input data-copy-source="${escapeHtml(subjectId)}" value="${escapeHtml(subject)}">
      </label>
      <label>메일 본문
        <textarea data-copy-source="${escapeHtml(bodyId)}">${escapeHtml(body)}</textarea>
      </label>
      <p class="muted">수정한 내용은 문안 저장 후 복사에 반영됩니다.</p>
      <div class="template-actions">
        <button type="button" data-action="save-template" data-template-sources="${escapeHtml(subjectId)}|${escapeHtml(bodyId)}">문안 저장</button>
        <button type="button" data-action="copy-template" data-copy-target="${escapeHtml(subjectId)}">제목 복사</button>
        <button type="button" data-action="copy-template" data-copy-target="${escapeHtml(bodyId)}">본문 복사</button>
      </div>
    </div>
  `;
}

function renderInvitationTemplate(notice, now) {
  if (!notice || !isNoticeOpen(notice, now)) return '';
  const template = createInvitationMailTemplate(notice);
  return `
    <section class="mail-template">
      <h2>Outlook 메일 템플릿</h2>
      ${renderTemplateBlock({
        title: '입찰 안내 메일',
        subject: template.subject,
        body: template.body,
        idPrefix: templateId('invite', notice.id, 'mail'),
      })}
    </section>
  `;
}

function renderResultTemplates(state, notice) {
  if (!notice || !hasPreferredProposal(state, notice.id)) return '';
  const proposals = state.proposals.filter((proposal) => proposal.bidNoticeId === notice.id);
  const templates = createResultMailTemplates({ notice, proposals, companies: state.companies });
  const preferredBlocks = templates.preferred.map((template) => renderTemplateBlock({
    title: `우선대상자 메일 문안 - ${template.companyName}`,
    subject: template.subject,
    body: template.body,
    idPrefix: templateId('preferred', template.proposalId, 'mail'),
  })).join('');
  const rejectedBlocks = templates.rejected.map((template) => renderTemplateBlock({
    title: `탈락자 메일 문안 - ${template.companyName}`,
    subject: template.subject,
    body: template.body,
    idPrefix: templateId('rejected', template.proposalId, 'mail'),
  })).join('') || '<p class="muted">탈락자로 분류된 업체가 없습니다.</p>';

  return `
    <section class="mail-template">
      <h2>결과 통보 메일 문안</h2>
      ${preferredBlocks}
      ${rejectedBlocks}
      ${notice.resultNotifiedAt ? `
        <span class="status-pill">통보 완료됨</span>
        <p class="muted">통보 완료 시각: ${escapeHtml(formatDateTime(notice.resultNotifiedAt))}</p>
      ` : `
        <button data-action="complete-result-notification" data-notice-id="${escapeHtml(notice.id)}">통보 완료</button>
      `}
    </section>
  `;
}

function renderNoticeList(state, notices, selectedNotice, now) {
  return notices.map((notice) => `
    <button class="notice-choice ${selectedNotice?.id === notice.id ? 'active' : ''}" data-notice-id="${escapeHtml(notice.id)}">
      <strong>${escapeHtml(notice.title)}</strong>
      <span>${escapeHtml(notice.category)} · ${escapeHtml(formatDateTime(notice.deadlineAt))} · ${escapeHtml(noticeWorkflowLabel(state, notice, now))}</span>
    </button>
  `).join('');
}

function renderSelectedProposalFile(file) {
  if (!file?.name) return '';
  return `
    <p class="selected-file">선택된 파일: <strong>${escapeHtml(file.name)}</strong> · ${escapeHtml(formatFileSize(file.size))}</p>
  `;
}

function renderParticipant(state, member, selectedNoticeId, now, selectedProposalFile) {
  const notices = state.notices.filter((notice) => notice.status === NoticeStatus.Published);
  const selectedNotice = findSelectedNotice({ ...state, notices }, selectedNoticeId);
  const myProposals = state.proposals.filter((proposal) => proposal.submittedByMemberId === member.id || proposal.supplierCompanyId === member.companyId);
  const selectedProposal = selectedNotice ? myProposals.find((proposal) => proposal.bidNoticeId === selectedNotice.id) : null;
  const canChangeProposalFile = selectedNotice ? isNoticeOpen(selectedNotice, now) : false;
  const canSubmit = canChangeProposalFile && !selectedProposal;

  return `
    ${renderHeader('입찰 내용 확인 및 제안', member, state)}
    <section class="metric-row">
      <article><strong>${notices.length}</strong><span>입찰목록</span></article>
      <article><strong>${myProposals.length}</strong><span>제출 제안서</span></article>
    </section>
    <section class="split-layout">
      <aside class="panel">
        <h2>입찰목록</h2>
        <div class="notice-list">${renderNoticeList(state, notices, selectedNotice, now)}</div>
      </aside>
      <section class="panel">
        <h2>${escapeHtml(selectedNotice?.title || '선택된 공고 없음')}</h2>
        ${selectedNotice ? `
          <p>${escapeHtml(selectedNotice.summary || selectedNotice.requirements)}</p>
          <dl class="detail-list">
            <div><dt>공고 기간 (한국시간)</dt><dd>${escapeHtml(formatDateTime(selectedNotice.startsAt))} ~ ${escapeHtml(formatDateTime(selectedNotice.deadlineAt))}</dd></div>
          </dl>
          ${renderRequestFile(selectedNotice)}
          <div class="upload-box">
            <h3>제안서 제출</h3>
            ${selectedProposal ? `
              <p>이미 제출한 제안서: <strong>${escapeHtml(selectedProposal.file?.name || selectedProposal.id)}</strong></p>
              <span class="status-pill">제출 완료</span>
              ${canChangeProposalFile ? `
                <input type="file" data-proposal-file>
                ${renderSelectedProposalFile(selectedProposalFile)}
                <button data-action="replace-proposal-file">파일 교체</button>
                <p>마감 전까지 파일을 교체할 수 있습니다. 운영자는 최종 제출본만 평가하고, 교체 전 원본도 보관 이력으로 남습니다.</p>
              ` : '<p>제출 마감 이후에는 파일을 교체할 수 없습니다.</p>'}
            ` : `
              <input type="file" data-proposal-file ${canSubmit ? '' : 'disabled'}>
              ${renderSelectedProposalFile(selectedProposalFile)}
              <button data-action="submit-proposal-file" ${canSubmit ? '' : 'disabled'}>제안서 제출</button>
              ${canSubmit ? '<p>압축 파일로 제안서 파일을 제안하세요</p>' : '<p>공고 기간이 아니거나 제출이 마감되었습니다.</p>'}
            `}
          </div>
        ` : '<p>참여할 공고를 선택하세요.</p>'}
      </section>
    </section>
  `;
}

function renderSubmissionReview(state, selectedNotice, now) {
  if (!selectedNotice) return '<p>공고를 선택하면 제출 파일을 확인할 수 있습니다.</p>';
  const submissions = state.proposals.filter((proposal) => proposal.bidNoticeId === selectedNotice.id);
  if (submissions.length === 0) return '<p>아직 제출된 제안서가 없습니다.</p>';
  const canOpenFiles = hasNoticeEnded(selectedNotice, now);
  const resultLocked = Boolean(selectedNotice.resultNotifiedAt);
  const resultSelectionReady = submissions.every((proposal) => hasEvaluation(state, proposal.id));

  return submissions.map((proposal) => {
    const evaluation = state.evaluations
      .filter((item) => item.proposalId === proposal.id)
      .at(-1);
    const score = evaluation?.totalScore ?? '';
    const note = evaluation?.note || '';

    return `
      <div class="submission-row">
        <div>
          <strong>${canOpenFiles ? escapeHtml(proposal.file?.name || '제출 파일') : '제출 파일 잠김'}</strong>
          <span>${canOpenFiles ? escapeHtml(formatFileSize(proposal.file?.size)) : '공고 기간 종료 후 열람 가능합니다.'}</span>
          ${canOpenFiles && proposal.file?.name ? `
            <a class="download-link" href="${escapeHtml(proposalFileHref(proposal))}" download="${escapeHtml(proposal.file.name)}">제안서 다운로드</a>
          ` : ''}
        </div>
        ${canOpenFiles ? `
          ${proposalResultLabel(proposal) ? `<span class="status-pill">${escapeHtml(proposalResultLabel(proposal))}</span>` : ''}
          <label>평가 점수
            <input data-evaluation-score="${escapeHtml(proposal.id)}" type="number" min="0" max="100" value="${escapeHtml(score)}" ${resultLocked ? 'disabled' : ''}>
          </label>
          <label>평가 메모
            <input data-evaluation-note="${escapeHtml(proposal.id)}" value="${escapeHtml(note)}" ${resultLocked ? 'disabled' : ''}>
          </label>
          ${resultLocked ? `
            <p class="muted">결과 통보 완료 후에는 평가를 수정할 수 없습니다.</p>
          ` : `
            <button data-action="save-evaluation" data-proposal-id="${escapeHtml(proposal.id)}">평가 저장</button>
          `}
          ${resultLocked ? `
            <p class="muted">결과 통보 완료 후에는 우선대상자를 변경할 수 없습니다.</p>
          ` : !resultSelectionReady ? `
            <p class="muted">모든 제출 업체의 평가를 저장한 뒤 우선대상자를 선택할 수 있습니다.</p>
          ` : `
            <button data-action="select-preferred" data-proposal-id="${escapeHtml(proposal.id)}" ${proposal.status === 'Selected' ? 'disabled' : ''}>우선대상자 선택</button>
          `}
        ` : '<span class="status-pill">기간 종료 후 열람 가능</span>'}
      </div>
    `;
  }).join('');
}

function renderOperator(state, member, selectedNoticeId, now) {
  const selectedNotice = findSelectedNotice(state, selectedNoticeId);
  const endedCount = state.notices.filter((notice) => hasNoticeEnded(notice, now)).length;

  return `
    <section class="metric-row">
      <article><strong>${state.notices.length}</strong><span>등록 공고</span></article>
      <article><strong>${endedCount}</strong><span>평가 가능 공고</span></article>
    </section>
    <section class="split-layout operator-layout">
      <aside class="panel">
        <h2>입찰목록</h2>
        <div class="notice-list">${renderNoticeList(state, state.notices, selectedNotice, now)}</div>
      </aside>
      <section class="panel">
        <h2>입찰목록 업로드</h2>
        <form class="notice-form" data-form="notice-create">
          <label>공고명<input name="title" value="신규 입찰 공고" required></label>
          <label>분야<input name="category" value="일반" required></label>
          <label>설명<input name="summary" value="제안서 파일 제출이 필요한 공고입니다." required></label>
          <label>시작일 (한국시간)<input name="startsAt" type="datetime-local" required></label>
          <label>종료일 (한국시간)<input name="deadlineAt" type="datetime-local" required></label>
          <label>제안요청서 파일<input name="requestFile" type="file" required></label>
          <button type="submit">입찰목록 업로드</button>
        </form>
        ${selectedNotice ? renderRequestFileReplacement(selectedNotice, { canReplace: !hasNoticeEnded(selectedNotice, now) && !selectedNotice.resultNotifiedAt }) : ''}
      </section>
      <section class="panel">
        <h2>제안서 확인 및 검토</h2>
        ${selectedNotice ? `
          <div class="status-line">
            <p><strong>${escapeHtml(selectedNotice.title)}</strong> · ${escapeHtml(formatDateTime(selectedNotice.startsAt))} ~ ${escapeHtml(formatDateTime(selectedNotice.deadlineAt))} (한국시간)</p>
            <span class="status-pill">${escapeHtml(noticeWorkflowLabel(state, selectedNotice, now))}</span>
          </div>
        ` : ''}
        ${selectedNotice ? renderRequestFile(selectedNotice) : ''}
        ${selectedNotice ? renderInvitationTemplate(selectedNotice, now) : ''}
        ${renderSubmissionReview(state, selectedNotice, now)}
        ${renderResultTemplates(state, selectedNotice)}
      </section>
    </section>
  `;
}

export function renderDashboard({ state, memberId, selectedNoticeId, selectedProposalFile = null, now = new Date().toISOString() }) {
  const member = findMember(state, memberId);
  if (!member) {
    return '<section class="empty-state"><h1>사용자를 찾을 수 없습니다</h1></section>';
  }

  if (member.role === MemberRole.Supplier) return renderParticipant(state, member, selectedNoticeId, now, selectedProposalFile);
  if (member.role === MemberRole.Operator) return renderOperator(state, member, selectedNoticeId, now);
  if (member.role === MemberRole.Buyer) return renderParticipant(state, member, selectedNoticeId, now, selectedProposalFile);
  return '<section class="empty-state"><h1>지원하지 않는 역할입니다</h1></section>';
}
