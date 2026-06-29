import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProposalFilePath, createRfpFilePath, createTimestamp, sanitizeFileName } from '../../src/app/supabase-storage-paths.js';

test('sanitizeFileName keeps Korean names and removes path separators', () => {
  assert.equal(sanitizeFileName('../사무실 제안요청서.pdf'), '사무실_제안요청서.pdf');
  assert.equal(sanitizeFileName('proposal final (v1).zip'), 'proposal_final_v1.zip');
});

test('createTimestamp formats ISO dates as compact storage timestamps', () => {
  assert.equal(createTimestamp(new Date('2026-06-24T09:30:15.123Z')), '20260624093015');
});

test('createRfpFilePath scopes files under notice folders', () => {
  assert.equal(
    createRfpFilePath({ noticeId: 'notice-1', fileName: '요청서.pdf', timestamp: '20260624093000' }),
    'notices/notice-1/20260624093000-요청서.pdf'
  );
});

test('createProposalFilePath scopes files under notice and supplier folders', () => {
  assert.equal(
    createProposalFilePath({ noticeId: 'notice-1', supplierId: 'supplier-1', fileName: '제안서.pdf', timestamp: '20260624093000' }),
    'notices/notice-1/suppliers/supplier-1/20260624093000-제안서.pdf'
  );
});
