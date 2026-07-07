import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const middlewareUrl = new URL('../../middleware.js', import.meta.url);
const middlewarePath = fileURLToPath(middlewareUrl);

async function loadMiddleware() {
  assert.equal(existsSync(middlewarePath), true, 'middleware.js should protect the operator login address');
  return import(middlewareUrl.href);
}

test('operator middleware documents the approved office IP allowlist', async () => {
  const source = await readFile(middlewarePath, 'utf8').catch(() => '');

  assert.match(source, /103\.114\.126\.33/);
  assert.match(source, /103\.114\.126\.34/);
});

test('operator middleware recognizes only the operator login addresses', async () => {
  const { isOperatorLoginRequest } = await loadMiddleware();

  assert.equal(isOperatorLoginRequest(new URL('https://bid.example.com/')), false);
  assert.equal(isOperatorLoginRequest(new URL('https://bid.example.com/?operator=0')), false);
  assert.equal(isOperatorLoginRequest(new URL('https://bid.example.com/?operator=1')), true);
  assert.equal(isOperatorLoginRequest(new URL('https://bid.example.com/operator')), true);
  assert.equal(isOperatorLoginRequest(new URL('https://bid.example.com/operator/')), true);
});

test('operator middleware reads the public client IP from forwarded headers', async () => {
  const { getClientIpFromRequest } = await loadMiddleware();
  const request = new Request('https://bid.example.com/operator', {
    headers: {
      'x-forwarded-for': '103.114.126.33, 10.0.0.1',
    },
  });

  assert.equal(getClientIpFromRequest(request), '103.114.126.33');
});

test('operator middleware allows only the approved IP addresses', async () => {
  const { isAllowedOperatorIp } = await loadMiddleware();

  assert.equal(isAllowedOperatorIp('103.114.126.33'), true);
  assert.equal(isAllowedOperatorIp('103.114.126.34'), true);
  assert.equal(isAllowedOperatorIp('127.0.0.1'), false);
  assert.equal(isAllowedOperatorIp('8.8.8.8'), false);
});

test('operator middleware keeps the Vercel review login open only when testing is enabled', async () => {
  const { protectOperatorLoginRequest } = await loadMiddleware();
  const request = new Request('https://bid.example.com/operator', {
    headers: {
      'x-forwarded-for': '8.8.8.8',
    },
  });

  assert.equal(protectOperatorLoginRequest(request, { reviewMode: true }), undefined);
  assert.equal(protectOperatorLoginRequest(request).status, 302);
});

test('operator middleware can enforce the IP allowlist when review testing is disabled', async () => {
  const { protectOperatorLoginRequest } = await loadMiddleware();
  const request = new Request('https://bid.example.com/operator', {
    headers: {
      'x-forwarded-for': '8.8.8.8',
    },
  });

  const response = protectOperatorLoginRequest(request, { reviewMode: false });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://bid.example.com/');
});

test('operator middleware lets approved operator login requests continue', async () => {
  const { default: middleware } = await loadMiddleware();
  const request = new Request('https://bid.example.com/operator', {
    headers: {
      'x-forwarded-for': '103.114.126.34',
    },
  });

  assert.equal(middleware(request), undefined);
});
