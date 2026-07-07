import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('browser app uses the EKS API client instead of demo role buttons', async () => {
  const source = await readFile('src/ui/app.js', 'utf8');

  assert.match(source, /createBidApiClient/);
  assert.match(source, /createApiBidStore/);
  assert.doesNotMatch(source, /createSupabaseBrowserClient/);
  assert.doesNotMatch(source, /createSupabaseBidStore/);
  assert.match(source, /name="email"/);
  assert.match(source, /name="password"/);
  assert.match(source, /name="operatorEmail"/);
  assert.match(source, /name="operatorPassword"/);
  assert.match(source, /name="signupPasswordConfirm"/);
  assert.match(source, /data-action="login"/);
  assert.match(source, /data-action="operator-login"/);
  assert.match(source, /data-action="signup"/);
  assert.match(source, /signIn/);
  assert.match(source, /assertExpectedLoginRole/);
  assert.match(source, /isOperatorLoginAddress/);
  assert.match(source, /store\.signOut\(\)/);
  assert.match(source, /signUpSupplier/);
  assert.match(source, /signOut/);
  assert.doesNotMatch(source, /loginMembers/);
  assert.doesNotMatch(source, /data-login-role/);
});

test('browser entrypoint renders a Korean startup failure instead of dropping boot errors', async () => {
  const source = await readFile('src/main.js', 'utf8');

  assert.match(source, /bootBidPlatformApp\(app\)\.catch/);
  assert.match(source, /앱을 시작하지 못했습니다/);
  assert.match(source, /console\.error/);
});

test('operator login is visible only on the operator address', async () => {
  const app = await import('../../src/ui/app.js');

  assert.equal(typeof app.isOperatorLoginAddress, 'function');
  assert.equal(app.isOperatorLoginAddress(new URL('https://bid.example.com/')), false);
  assert.equal(app.isOperatorLoginAddress(new URL('https://bid.example.com/?operator=0')), false);
  assert.equal(app.isOperatorLoginAddress(new URL('https://bid.example.com/?operator=1')), true);
  assert.equal(app.isOperatorLoginAddress(new URL('https://bid.example.com/operator')), true);
  assert.equal(app.isOperatorLoginAddress(new URL('https://bid.example.com/#operator')), false);
});

test('operator login is visible on the public login screen while review testing is enabled', async () => {
  const app = await import('../../src/ui/app.js');

  assert.equal(typeof app.isOperatorLoginVisible, 'function');
  assert.equal(app.isOperatorLoginVisible(new URL('https://bid.example.com/')), false);
  assert.equal(app.isOperatorLoginVisible(new URL('https://bid.example.com/'), { reviewMode: true }), true);
  assert.equal(app.isOperatorLoginVisible(new URL('https://bid.example.com/'), { reviewMode: false }), false);
  assert.equal(app.isOperatorLoginVisible(new URL('https://bid.example.com/operator'), { reviewMode: false }), true);
});

test('first access separates participant and operator login pages', async () => {
  const app = await import('../../src/ui/app.js');
  const source = await readFile('src/ui/app.js', 'utf8');

  assert.equal(typeof app.chooseInitialAuthView, 'function');
  assert.equal(app.chooseInitialAuthView(new URL('https://bid.example.com/')), 'entry');
  assert.equal(app.chooseInitialAuthView(new URL('https://bid.example.com/operator')), 'operator');
  assert.match(source, /renderRoleSelection/);
  assert.match(source, /data-auth-view="supplier"/);
  assert.match(source, /data-auth-view="operator"/);
  assert.match(source, /data-auth-view="entry"/);
  assert.match(source, /renderSupplierAuthScreen/);
  assert.match(source, /renderOperatorAuthScreen/);
  assert.match(source, /입찰자 로그인/);
  assert.match(source, /운영자 로그인/);
  assert.doesNotMatch(source, /입찰자 로그인 페이지/);
  assert.doesNotMatch(source, /운영자 로그인 페이지/);
  assert.match(source, /입찰목록 업로드/);
  assert.match(source, /입찰 내용 확인 및 제안/);
  assert.match(source, /제안서 확인 및 검토/);
  assert.match(source, /authView === 'entry' \? renderRoleSelection\(\) : ''/);
});

test('selected notice is retained only when it exists in the refreshed notice list', async () => {
  const app = await import('../../src/ui/app.js');

  assert.equal(typeof app.chooseSelectedNoticeId, 'function');
  assert.equal(app.chooseSelectedNoticeId([{ id: 'notice-1' }, { id: 'notice-2' }], 'notice-2'), 'notice-2');
  assert.equal(app.chooseSelectedNoticeId([{ id: 'notice-1' }], 'old-notice'), 'notice-1');
  assert.equal(app.chooseSelectedNoticeId([], 'old-notice'), null);
});

test('login role guard rejects mismatched account types', async () => {
  const app = await import('../../src/ui/app.js');

  assert.equal(typeof app.assertExpectedLoginRole, 'function');
  assert.equal(
    app.assertExpectedLoginRole({
      status: 'signed_in',
      member: { role: 'Operator' },
    }, 'Operator').member.role,
    'Operator',
  );
  assert.throws(
    () => app.assertExpectedLoginRole({
      status: 'signed_in',
      member: { role: 'Supplier' },
    }, 'Operator'),
    /운영자 계정으로 로그인하세요/,
  );
  assert.throws(
    () => app.assertExpectedLoginRole({
      status: 'signed_in',
      member: { role: 'Operator' },
    }, 'Supplier'),
    /입찰 참여자 계정으로 로그인하세요/,
  );
});

test('notice date inputs are saved as Korea Standard Time instants', async () => {
  const app = await import('../../src/ui/app.js');

  assert.equal(typeof app.toKoreanTimeIsoString, 'function');
  assert.equal(app.toKoreanTimeIsoString('2026-06-22T09:00'), '2026-06-22T00:00:00.000Z');
  assert.equal(app.toKoreanTimeIsoString('2026-07-05T18:00'), '2026-07-05T09:00:00.000Z');
});

test('rendered date labels and formatting are fixed to Korea Standard Time', async () => {
  const source = await readFile('src/ui/render.js', 'utf8');

  assert.match(source, /timeZone:\s*'Asia\/Seoul'/);
  assert.match(source, /시작일 \(한국시간\)/);
  assert.match(source, /종료일 \(한국시간\)/);
});

test('technical backend errors are converted to safe Korean user messages', async () => {
  const app = await import('../../src/ui/app.js');
  const source = await readFile('src/ui/app.js', 'utf8');

  assert.equal(typeof app.toSafeUserMessage, 'function');
  assert.equal(
    app.toSafeUserMessage(new Error('permission denied for relation public.evaluations'), '평가를 저장하지 못했습니다.'),
    '평가를 저장하지 못했습니다.',
  );
  assert.equal(
    app.toSafeUserMessage(new Error('로그인 후 제안서를 제출하세요.'), '제안서를 제출하지 못했습니다.'),
    '로그인 후 제안서를 제출하세요.',
  );
  assert.doesNotMatch(source, /message = error\.message/);
});
