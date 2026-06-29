import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSupabaseConfig, createMissingSupabaseConfigMessage } from '../../src/integrations/supabase/config.js';

test('getSupabaseConfig returns configured Vite Supabase variables', () => {
  const config = getSupabaseConfig({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  });

  assert.deepEqual(config, {
    url: 'https://example.supabase.co',
    anonKey: 'anon-key',
    configured: true,
  });
});

test('getSupabaseConfig reports missing values without throwing', () => {
  const config = getSupabaseConfig({});

  assert.deepEqual(config, {
    url: '',
    anonKey: '',
    configured: false,
  });
  assert.match(createMissingSupabaseConfigMessage(), /Supabase 환경변수/);
  assert.match(createMissingSupabaseConfigMessage(), /VITE_SUPABASE_URL/);
  assert.match(createMissingSupabaseConfigMessage(), /VITE_SUPABASE_ANON_KEY/);
});
