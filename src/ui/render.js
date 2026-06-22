import { MemberRole, NoticeStatus } from '../domain/constants.js';

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

function companyName(state, companyId) {
  return state.companies.find((company) => company.id === companyId)?.name || 'Platform';
}

function renderHeader(title, member, state) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(companyName(state, member.companyId))}</p>
        <h1>${title}</h1>
      </div>
      <span class="role-pill">${escapeHtml(member.role)}</span>
    </header>
  `;
}

function renderBuyer(state, member) {
  const notices = state.notices.filter((notice) => notice.buyerCompanyId === member.companyId);
  const proposalCount = state.proposals.filter((proposal) => notices.some((notice) => notice.id === proposal.bidNoticeId)).length;
  return `
    ${renderHeader('Buyer Portal', member, state)}
    <section class="metric-row">
      <article><strong>${notices.length}</strong><span>Bid Notices</span></article>
      <article><strong>${proposalCount}</strong><span>Submitted Proposals</span></article>
    </section>
    <section class="panel">
      <h2>Bid Notices</h2>
      ${notices.map((notice) => `<div class="list-row"><strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.status)}</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>Proposal Comparison</h2>
      <p>Compare supplier price, schedule, status, and scores for notices owned by this buyer company.</p>
    </section>
  `;
}

function renderSupplier(state, member) {
  const publicNotices = state.notices.filter((notice) => notice.status === NoticeStatus.Published);
  const myProposals = state.proposals.filter((proposal) => proposal.supplierCompanyId === member.companyId);
  const savedNotices = (state.savedNotices || []).filter((item) => item.memberId === member.id);
  return `
    ${renderHeader('Supplier Portal', member, state)}
    <section class="metric-row">
      <article><strong>${savedNotices.length}</strong><span>Saved Notices</span></article>
      <article><strong>${myProposals.length}</strong><span>My Proposals</span></article>
    </section>
    <section class="panel">
      <h2>Public Bid Discovery</h2>
      ${publicNotices.map((notice) => `<div class="list-row"><strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.category)}</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>Saved Notices</h2>
      ${savedNotices.length === 0 ? '<p>No saved notices yet.</p>' : savedNotices.map((item) => `<div class="list-row"><strong>${escapeHtml(item.noticeId)}</strong><span>Saved</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>My Proposals</h2>
      ${myProposals.length === 0 ? '<p>No proposals submitted yet.</p>' : myProposals.map((proposal) => `<div class="list-row"><strong>${escapeHtml(proposal.id)}</strong><span>${escapeHtml(proposal.status)}</span></div>`).join('')}
    </section>
  `;
}

function renderOperator(state, member) {
  const pendingCompanies = state.companies.filter((company) => company.status === 'Pending');
  const hiddenNotices = state.notices.filter((notice) => notice.status === NoticeStatus.Hidden);
  return `
    ${renderHeader('Operator Console', member, state)}
    <section class="metric-row">
      <article><strong>${pendingCompanies.length}</strong><span>Company Review</span></article>
      <article><strong>${state.reports.length}</strong><span>Open Reports</span></article>
    </section>
    <section class="panel">
      <h2>Company Review</h2>
      ${state.companies.map((company) => `<div class="list-row"><strong>${escapeHtml(company.name)}</strong><span>${escapeHtml(company.status)}</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>Notice Moderation</h2>
      <p>${hiddenNotices.length} hidden notices need review.</p>
    </section>
  `;
}

export function renderDashboard({ state, memberId }) {
  const member = findMember(state, memberId);
  if (!member) {
    return '<section class="empty-state"><h1>Member not found</h1></section>';
  }

  if (member.role === MemberRole.Buyer) return renderBuyer(state, member);
  if (member.role === MemberRole.Supplier) return renderSupplier(state, member);
  if (member.role === MemberRole.Operator) return renderOperator(state, member);
  return '<section class="empty-state"><h1>Unsupported role</h1></section>';
}
