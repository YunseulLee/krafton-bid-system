import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('browser app starts with AWS EKS API email login instead of direct role switching', async () => {
  const appSource = await readFile('src/ui/app.js', 'utf8');

  assert.match(appSource, /크래프톤 입찰시스템/);
  assert.doesNotMatch(appSource, /입찰 시스템 로그인/);
  assert.doesNotMatch(appSource, /국내용 입찰 시스템/);
  assert.match(appSource, /name="email"/);
  assert.match(appSource, /name="password"/);
  assert.match(appSource, /data-auth-mode="login"/);
  assert.match(appSource, /data-auth-mode="signup"/);
  assert.match(appSource, /name="signupEmail"/);
  assert.match(appSource, /name="signupPassword"/);
  assert.match(appSource, /name="signupPasswordConfirm"/);
  assert.match(appSource, /운영자 로그인/);
  assert.match(appSource, /입찰자 로그인/);
  assert.doesNotMatch(appSource, /운영자 로그인 페이지/);
  assert.doesNotMatch(appSource, /입찰자 로그인 페이지/);
  assert.match(appSource, /name="operatorEmail"/);
  assert.match(appSource, /name="operatorPassword"/);
  assert.match(appSource, /data-form="operator-login"/);
  assert.match(appSource, /data-action="operator-login"/);
  assert.match(appSource, /assertExpectedLoginRole/);
  assert.match(appSource, /expectedRole:\s*'Operator'/);
  assert.match(appSource, /운영자 계정으로 로그인하세요/);
  assert.match(appSource, /비밀번호 확인/);
  assert.match(appSource, /가입한 로그인 정보는 14일 동안만 사용할 수 있습니다/);
  assert.match(appSource, /사용기간이 지나면 다시 가입해야 합니다/);
  const signupForm = appSource.match(/function renderSignupForm\(\) {[\s\S]*?function renderOperatorLoginForm/)?.[0] || '';
  assert.doesNotMatch(signupForm, /계정 사용기간이 만료되었습니다\. 다시 가입해 주세요/);
  const refreshSession = appSource.match(/async function refreshSession\(\) {[\s\S]*?catch \(error\)/)?.[0] || '';
  assert.match(refreshSession, /계정 사용기간이 만료되었습니다\. 다시 가입해 주세요/);
  assert.match(appSource, /data-action="login"/);
  assert.match(appSource, /data-action="signup"/);
  assert.match(appSource, /data-auth-view="supplier"/);
  assert.match(appSource, /data-auth-view="operator"/);
  assert.match(appSource, /data-auth-view="entry"/);
  assert.match(appSource, /createBidApiClient/);
  assert.match(appSource, /createApiBidStore/);
  assert.doesNotMatch(appSource, /createSupabaseBrowserClient/);
  assert.doesNotMatch(appSource, /createSupabaseBidStore/);
  assert.match(appSource, /signUpSupplier/);
  assert.doesNotMatch(appSource, /auth-checklist/);
  assert.doesNotMatch(appSource, /이메일\/비밀번호 확인/);
  assert.doesNotMatch(appSource, /supplier 역할/);
  assert.doesNotMatch(appSource, /업체 승인 완료/);
  assert.match(appSource, /data-action="logout"/);
  assert.match(appSource, /입찰자 또는 운영자 로그인을 선택하세요/);
  assert.doesNotMatch(appSource, /data-member-id/);
  assert.doesNotMatch(appSource, /data-login-role/);
  assert.doesNotMatch(appSource, /role-switcher/);
});

test('browser app blocks notice creation until the operator enters both Korean-time period fields', async () => {
  const appSource = await readFile('src/ui/app.js', 'utf8');

  assert.match(appSource, /공고 시작일과 종료일을 입력하세요/);
  assert.match(appSource, /const startsAtInput = String\(form\.get\('startsAt'\) \|\| ''\)\.trim\(\)/);
  assert.match(appSource, /const deadlineAtInput = String\(form\.get\('deadlineAt'\) \|\| ''\)\.trim\(\)/);
  assert.match(appSource, /if \(!startsAtInput \|\| !deadlineAtInput\)/);
  assert.match(appSource, /startsAt: toKoreanTimeIsoString\(startsAtInput\)/);
  assert.match(appSource, /deadlineAt: toKoreanTimeIsoString\(deadlineAtInput\)/);
});
