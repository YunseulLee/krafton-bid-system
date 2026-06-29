import { createMissingSupabaseConfigMessage } from '../integrations/supabase/config.js';
import { createSupabaseBrowserClient } from '../integrations/supabase/client.js';
import { createSupabaseBidStore } from '../app/supabase-bid-store.js';
import { renderDashboard } from './render.js';

export function toKoreanTimeIsoString(value) {
  const rawValue = String(value || '').trim();
  const match = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return new Date(rawValue).toISOString();

  const [, year, month, day, hour, minute, second = '0'] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 9,
    Number(minute),
    Number(second)
  )).toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function labelRole(role) {
  if (role === 'Operator') return '운영자';
  if (role === 'Supplier') return '입찰 참여자';
  if (role === 'Buyer') return '구매자';
  return '사용자';
}

export function assertExpectedLoginRole(session, expectedRole) {
  if (session?.status !== 'signed_in' || !session.member) {
    throw new Error('로그인 정보를 확인하지 못했습니다.');
  }

  if (session.member.role === expectedRole) return session;

  throw new Error(expectedRole === 'Operator'
    ? '운영자 계정으로 로그인하세요.'
    : '입찰 참여자 계정으로 로그인하세요.');
}

export function isOperatorLoginAddress(location = globalThis.location) {
  if (!location) return false;

  const pathname = String(location.pathname || '').replace(/\/+$/, '');
  const search = String(location.search || '');
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  return searchParams.get('operator') === '1'
    || pathname.endsWith('/operator');
}

export function isOperatorLoginReviewModeEnabled(value = import.meta.env?.VITE_OPERATOR_LOGIN_REVIEW_MODE) {
  if (value === undefined || value === null || value === '') return true;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

export function isOperatorLoginVisible(location = globalThis.location, options = {}) {
  const reviewMode = options.reviewMode ?? isOperatorLoginReviewModeEnabled();
  return reviewMode || isOperatorLoginAddress(location);
}

export function chooseSelectedNoticeId(notices, selectedNoticeId) {
  const availableNotices = Array.isArray(notices) ? notices : [];
  if (selectedNoticeId && availableNotices.some((notice) => notice.id === selectedNoticeId)) {
    return selectedNoticeId;
  }
  return availableNotices[0]?.id || null;
}

export function toSafeUserMessage(error, fallbackMessage = '요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.') {
  const rawMessage = String(error?.message || '').trim();
  if (!rawMessage) return fallbackMessage;

  const hasKoreanMessage = /[가-힣]/.test(rawMessage);
  const exposesBackendDetail = /(permission denied|violates|policy|row-level|rls|relation|column|schema|public\.|storage\.objects|jwt|postgrest|pgrst|sqlstate|duplicate key|foreign key|null value|invalid input syntax|new row|bucket)/i
    .test(rawMessage);

  if (!hasKoreanMessage || exposesBackendDetail) return fallbackMessage;
  return rawMessage;
}

function reportUserError(error, fallbackMessage) {
  console.error(error);
  return toSafeUserMessage(error, fallbackMessage);
}

function metadataFromFile(file) {
  if (!file?.name) return null;
  return file;
}

export async function bootBidPlatformApp(root) {
  const now = () => new Date().toISOString();
  const { client, config } = await createSupabaseBrowserClient();
  let store = client ? createSupabaseBidStore({ supabase: client }) : null;
  let session = { status: 'signed_out' };
  let state = null;
  let selectedNoticeId = null;
  let selectedFile = null;
  let supplierAuthMode = 'login';
  let message = config.configured ? loginPromptMessage() : createMissingSupabaseConfigMessage();
  const savedMailTemplates = new Map();

  function loginPromptMessage() {
    return isOperatorLoginVisible(globalThis.location)
      ? '입찰 참여자 또는 운영자는 로그인하세요.'
      : '입찰 참여자는 로그인하거나 가입하세요.';
  }

  function currentMember() {
    return session.status === 'signed_in' ? session.member : null;
  }

  function renderActions() {
    return `
      <section class="action-bar">
        <p>${escapeHtml(message)}</p>
      </section>
    `;
  }

  function renderSessionBar() {
    const member = currentMember();
    if (!member) return '';
    return `
      <nav class="session-bar" aria-label="로그인 상태">
        <div>
          <strong>${escapeHtml(labelRole(member.role))}</strong>
          <span>${escapeHtml(member.companyName || member.email || '')}</span>
        </div>
        <button data-action="logout">로그아웃</button>
      </nav>
    `;
  }

  function renderMissingConfigHint() {
    if (store) return '';
    return '<p class="login-help">Supabase 환경변수 설정 후 로그인할 수 있습니다.</p>';
  }

  function renderAuthTabs() {
    return `
      <div class="auth-tabs" aria-label="입찰 참여자 인증 선택">
        <button class="auth-tab ${supplierAuthMode === 'login' ? 'active' : ''}" type="button" data-auth-mode="login">로그인</button>
        <button class="auth-tab ${supplierAuthMode === 'signup' ? 'active' : ''}" type="button" data-auth-mode="signup">가입</button>
      </div>
    `;
  }

  function renderSupplierLoginForm() {
    return `
      <form class="login-form" data-form="supplier-login">
        <label>이메일<input name="email" type="email" autocomplete="email" required></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
        <button data-action="login" type="submit" ${store ? '' : 'disabled'}>로그인</button>
        ${renderMissingConfigHint()}
      </form>
    `;
  }

  function renderSignupForm() {
    return `
      <form class="login-form" data-form="signup">
        <label>이메일<input name="signupEmail" type="email" autocomplete="email" required></label>
        <label>비밀번호<input name="signupPassword" type="password" autocomplete="new-password" required></label>
        <label>비밀번호 확인<input name="signupPasswordConfirm" type="password" autocomplete="new-password" required></label>
        <p class="login-help">가입한 로그인 정보는 14일 동안만 사용할 수 있습니다. 사용기간이 지나면 다시 가입해야 합니다.</p>
        <p class="login-help">계정 사용기간이 만료되었습니다. 다시 가입해 주세요.</p>
        <button data-action="signup" type="submit" ${store ? '' : 'disabled'}>가입</button>
        ${renderMissingConfigHint()}
      </form>
    `;
  }

  function renderOperatorLoginForm() {
    return `
      <form class="login-form" data-form="operator-login">
        <label>운영자 이메일<input name="operatorEmail" type="email" autocomplete="username" required></label>
        <label>비밀번호<input name="operatorPassword" type="password" autocomplete="current-password" required></label>
        <button data-action="operator-login" type="submit" ${store ? '' : 'disabled'}>운영자 로그인</button>
        ${renderMissingConfigHint()}
      </form>
    `;
  }

  function renderLogin() {
    const showOperatorLogin = isOperatorLoginVisible(globalThis.location);
    return `
      <section class="login-screen">
        <header class="topbar">
          <div class="login-copy">
            <h1>크래프톤 입찰시스템</h1>
          </div>
        </header>
        <section class="login-grid ${showOperatorLogin ? '' : 'single'}" aria-label="로그인 선택">
          <section class="login-card auth-login" aria-label="입찰 참여자 로그인">
            <strong>입찰 참여자 로그인</strong>
            ${renderAuthTabs()}
            ${supplierAuthMode === 'signup' ? renderSignupForm() : renderSupplierLoginForm()}
          </section>
          ${showOperatorLogin ? `
          <section class="login-card auth-login" aria-label="운영자 로그인">
            <strong>운영자 로그인</strong>
            ${renderOperatorLoginForm()}
          </section>
          ` : ''}
        </section>
      </section>
    `;
  }

  async function signInWithExpectedRole({ email, password, expectedRole }) {
    const signedInSession = await store.signIn(email, password);
    try {
      return assertExpectedLoginRole(signedInSession, expectedRole);
    } catch (error) {
      try {
        await store.signOut();
      } catch (signOutError) {
        console.error(signOutError);
      }
      throw error;
    }
  }

  function render() {
    const member = currentMember();
    root.innerHTML = `
      ${renderSessionBar()}
      ${renderActions()}
      <div class="workspace">
        ${member && state ? renderDashboard({ state, memberId: member.id, selectedNoticeId, selectedProposalFile: selectedFile, now: now() }) : renderLogin()}
      </div>
    `;
    hydrateSavedMailTemplates();

    root.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        supplierAuthMode = button.dataset.authMode;
        message = supplierAuthMode === 'signup'
          ? '가입한 로그인 정보는 14일 동안만 사용할 수 있습니다.'
          : '입찰 참여자 이메일과 비밀번호로 로그인하세요.';
        render();
      });
    });

    const loginForm = root.querySelector('[data-form="supplier-login"]');
    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!store) {
          message = createMissingSupabaseConfigMessage();
          render();
          return;
        }

        const form = new FormData(loginForm);
        const email = String(form.get('email') || '').trim();
        const password = String(form.get('password') || '');
        try {
          message = '로그인 중입니다.';
          render();
          await signInWithExpectedRole({ email, password, expectedRole: 'Supplier' });
          selectedFile = null;
          message = '입찰 참여자 계정으로 로그인되었습니다.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '로그인하지 못했습니다. 이메일과 비밀번호를 확인하세요.');
          render();
        }
      });
    }

    const operatorLoginForm = root.querySelector('[data-form="operator-login"]');
    if (operatorLoginForm) {
      operatorLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!store) {
          message = createMissingSupabaseConfigMessage();
          render();
          return;
        }

        const form = new FormData(operatorLoginForm);
        const email = String(form.get('operatorEmail') || '').trim();
        const password = String(form.get('operatorPassword') || '');
        try {
          message = '운영자 로그인 중입니다.';
          render();
          await signInWithExpectedRole({ email, password, expectedRole: 'Operator' });
          selectedFile = null;
          message = '운영자 계정으로 로그인되었습니다.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '운영자 로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.');
          render();
        }
      });
    }

    const signupForm = root.querySelector('[data-form="signup"]');
    if (signupForm) {
      signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!store) {
          message = createMissingSupabaseConfigMessage();
          render();
          return;
        }

        const form = new FormData(signupForm);
        const email = String(form.get('signupEmail') || '').trim();
        const password = String(form.get('signupPassword') || '');
        const passwordConfirm = String(form.get('signupPasswordConfirm') || '');
        if (password !== passwordConfirm) {
          message = '비밀번호가 일치하지 않습니다.';
          render();
          return;
        }

        try {
          message = '가입 중입니다.';
          render();
          await store.signUpSupplier(email, password);
          supplierAuthMode = 'login';
          message = '가입되었습니다. 가입한 로그인 정보는 14일 동안만 사용할 수 있습니다. 이메일과 비밀번호로 로그인하세요.';
          render();
        } catch (error) {
          message = reportUserError(error, '가입하지 못했습니다. 입력 내용을 확인하세요.');
          render();
        }
      });
    }

    const logoutButton = root.querySelector('[data-action="logout"]');
    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        try {
          if (store) await store.signOut();
          session = { status: 'signed_out' };
          state = null;
          selectedNoticeId = null;
          selectedFile = null;
          message = `로그아웃되었습니다. ${loginPromptMessage()}`;
        } catch (error) {
          message = reportUserError(error, '로그아웃하지 못했습니다. 잠시 후 다시 시도하세요.');
        }
        render();
      });
    }

    root.querySelectorAll('[data-notice-id]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedNoticeId = button.dataset.noticeId;
        selectedFile = null;
        message = '선택한 공고를 확인했습니다.';
        render();
      });
    });

    const fileInput = root.querySelector('[data-proposal-file]');
    if (fileInput) {
      fileInput.addEventListener('change', (event) => {
        selectedFile = metadataFromFile(event.target.files?.[0]);
        message = selectedFile ? `${selectedFile.name} 파일이 선택되었습니다.` : '제안서 파일을 선택하세요.';
        render();
      });
    }

    root.querySelectorAll('[data-action="submit-proposal-file"], [data-action="replace-proposal-file"]').forEach((proposalFileButton) => {
      proposalFileButton.addEventListener('click', async () => {
        const member = currentMember();
        const replacing = proposalFileButton.dataset.action === 'replace-proposal-file';
        try {
          if (!store || !member) throw new Error('로그인 후 제안서를 제출하세요.');
          if (!selectedNoticeId) throw new Error('제안서를 제출할 공고를 선택하세요.');
          if (!selectedFile) throw new Error('제안서 파일을 선택하세요.');
          await store.submitProposalFile(member, selectedNoticeId, selectedFile);
          selectedFile = null;
          message = replacing
            ? '제안서 파일이 교체되었습니다. 운영자는 최종 제출본만 평가합니다.'
            : '제안서가 제출되었습니다. 운영자는 공고 기간 종료 후 파일을 열람할 수 있습니다.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '제안서를 제출하지 못했습니다. 입력 내용을 확인하세요.');
          render();
        }
      });
    });

    const noticeForm = root.querySelector('[data-form="notice-create"]');
    if (noticeForm) {
      noticeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const member = currentMember();
        const form = new FormData(noticeForm);
        try {
          if (!store || !member) throw new Error('로그인 후 공고를 추가하세요.');
          const requestFile = metadataFromFile(form.get('requestFile'));
          if (!requestFile) throw new Error('제안요청서 파일을 선택하세요.');
          const notice = await store.createOperatorNotice(member, {
            title: form.get('title'),
            category: form.get('category'),
            summary: form.get('summary'),
            startsAt: toKoreanTimeIsoString(form.get('startsAt')),
            deadlineAt: toKoreanTimeIsoString(form.get('deadlineAt')),
            requestFile,
          });
          selectedNoticeId = notice.id;
          selectedFile = null;
          message = '공고와 제안요청서가 추가되었습니다.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '공고를 추가하지 못했습니다. 입력 내용과 파일을 확인하세요.');
          render();
        }
      });
    }

    root.querySelectorAll('[data-action="replace-rfp-file"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const member = currentMember();
        const noticeId = button.dataset.noticeId;
        const fileInput = Array.from(root.querySelectorAll('[data-rfp-file]'))
          .find((input) => input.dataset.rfpFile === noticeId);
        const requestFile = metadataFromFile(fileInput?.files?.[0]);
        try {
          if (!store || !member) throw new Error('로그인 후 제안요청서를 교체하세요.');
          if (!noticeId) throw new Error('제안요청서를 교체할 공고를 선택하세요.');
          if (!requestFile) throw new Error('교체할 제안요청서 파일을 선택하세요.');
          await store.replaceNoticeRequestFile(member, noticeId, requestFile);
          selectedNoticeId = noticeId;
          message = '제안요청서가 최신 파일로 교체되었습니다. 입찰 참여자는 최신 제안요청서만 다운로드합니다.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '제안요청서를 교체하지 못했습니다. 입력 내용과 파일을 확인하세요.');
          render();
        }
      });
    });

    root.querySelectorAll('[data-action="save-evaluation"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const member = currentMember();
        const proposalId = button.dataset.proposalId;
        const scoreValue = root.querySelector(`[data-evaluation-score="${proposalId}"]`)?.value || '';
        const score = scoreValue.trim() === '' ? Number.NaN : Number(scoreValue);
        const note = root.querySelector(`[data-evaluation-note="${proposalId}"]`)?.value || '';
        try {
          if (!store || !member) throw new Error('로그인 후 평가를 저장하세요.');
          await store.evaluateSubmission(member, proposalId, { score, note });
          message = '평가가 저장되었습니다.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '평가를 저장하지 못했습니다. 입력 값을 확인하세요.');
          render();
        }
      });
    });

    root.querySelectorAll('[data-action="select-preferred"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const proposalId = button.dataset.proposalId;
        const proposal = state?.proposals.find((item) => item.id === proposalId);
        const noticeId = proposal?.bidNoticeId || selectedNoticeId;
        try {
          if (!store) throw new Error('로그인 후 우선대상자를 선택하세요.');
          if (!noticeId) throw new Error('공고를 선택하세요.');
          await store.selectPreferredProposal(proposalId, noticeId);
          message = '우선대상자를 선택했습니다. 결과 통보 메일 문안을 Outlook에서 발송하세요.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '우선대상자를 선택하지 못했습니다. 평가 상태를 확인하세요.');
          render();
        }
      });
    });

    root.querySelectorAll('[data-action="complete-result-notification"]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          if (!store) throw new Error('로그인 후 통보 완료 상태를 기록하세요.');
          await store.markResultNotificationComplete(button.dataset.noticeId);
          message = 'Outlook 결과 통보 완료 상태가 기록되었습니다.';
          await refreshSession();
        } catch (error) {
          message = reportUserError(error, '통보 완료 상태를 기록하지 못했습니다. 잠시 후 다시 시도하세요.');
          render();
        }
      });
    });

    root.querySelectorAll('[data-action="save-template"]').forEach((button) => {
      button.addEventListener('click', () => {
        const sourceIds = String(button.dataset.templateSources || '').split('|').filter(Boolean);
        sourceIds.forEach((sourceId) => {
          const source = root.querySelector(`[data-copy-source="${sourceId}"]`);
          savedMailTemplates.set(sourceId, source?.value || '');
        });
        message = 'Outlook 메일 문안이 저장되었습니다. 복사 버튼은 저장된 문안만 사용합니다.';
        render();
      });
    });

    root.querySelectorAll('[data-action="copy-template"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const source = root.querySelector(`[data-copy-source="${button.dataset.copyTarget}"]`);
        const text = savedMailTemplates.get(button.dataset.copyTarget) ?? source?.value ?? '';
        try {
          if (!navigator.clipboard?.writeText) throw new Error('클립보드를 사용할 수 없습니다.');
          await navigator.clipboard.writeText(text);
          message = '저장된 Outlook 문안을 복사했습니다.';
          render();
        } catch (error) {
          if (source && source.value !== text) source.value = text;
          if (source?.select) source.select();
          message = '선택된 문안을 복사해서 Outlook에 붙여넣으세요.';
          const messageElement = root.querySelector('.action-bar p');
          if (messageElement) messageElement.textContent = message;
        }
      });
    });
  }

  function hydrateSavedMailTemplates() {
    root.querySelectorAll('[data-copy-source]').forEach((source) => {
      const sourceId = source.dataset.copySource;
      if (!savedMailTemplates.has(sourceId)) {
        savedMailTemplates.set(sourceId, source.value || '');
      }
      source.value = savedMailTemplates.get(sourceId) || '';
    });
  }

  async function refreshSession() {
    if (!store) {
      session = { status: 'signed_out' };
      state = null;
      selectedNoticeId = null;
      render();
      return;
    }

    try {
      session = await store.loadSession();
      if (session.status === 'signed_in') {
        state = await store.loadDashboard(session.member);
        selectedNoticeId = chooseSelectedNoticeId(state.notices, selectedNoticeId);
      } else if (session.status === 'expired') {
        supplierAuthMode = 'signup';
        message = session.message || '계정 사용기간이 만료되었습니다. 다시 가입해 주세요.';
        state = null;
        selectedNoticeId = null;
        selectedFile = null;
      } else {
        state = null;
        selectedNoticeId = null;
        selectedFile = null;
      }
    } catch (error) {
      session = { status: 'signed_out' };
      state = null;
      selectedNoticeId = null;
      selectedFile = null;
      message = reportUserError(error, '세션을 확인하지 못했습니다. 다시 로그인해 주세요.');
    }
    render();
  }

  await refreshSession();
}
