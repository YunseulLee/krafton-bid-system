import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBidApiConfig, createMissingBidApiConfigMessage } from '../../src/integrations/api/config.js';

test('getBidApiConfig reads the EKS API base URL from public browser env', () => {
  const config = getBidApiConfig({
    VITE_BID_API_BASE_URL: 'https://bid-api.example.com',
  });

  assert.deepEqual(config, {
    baseUrl: 'https://bid-api.example.com',
    configured: true,
  });
});

test('getBidApiConfig reads the static build browser environment fallback', () => {
  globalThis.__BID_ENV__ = {
    VITE_BID_API_BASE_URL: 'https://static-bid-api.example.com/',
  };

  try {
    const config = getBidApiConfig();

    assert.deepEqual(config, {
      baseUrl: 'https://static-bid-api.example.com',
      configured: true,
    });
  } finally {
    delete globalThis.__BID_ENV__;
  }
});

test('getBidApiConfig reports missing EKS API config without secrets', () => {
  const config = getBidApiConfig({});

  assert.equal(config.configured, false);
  assert.match(createMissingBidApiConfigMessage(), /AWS EKS API 주소/);
  assert.match(createMissingBidApiConfigMessage(), /VITE_BID_API_BASE_URL/);
  assert.doesNotMatch(createMissingBidApiConfigMessage(), /DATABASE_URL|PASSWORD|SECRET|PRIVATE/i);
});
