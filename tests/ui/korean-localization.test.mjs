import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createSeedData } from '../../src/app/seed-data.js';

test('browser action labels and workflow messages are Korean', async () => {
  const appSource = await readFile('src/ui/app.js', 'utf8');

  assert.match(appSource, /이메일과 비밀번호로 로그인하세요/);
  assert.match(appSource, /AWS EKS API 주소/);
  assert.match(appSource, /입찰 참여/);
  assert.match(appSource, /운영자/);
  assert.match(appSource, /제안서가 제출되었습니다/);
  assert.match(appSource, /공고와 제안요청서가 추가되었습니다/);
  assert.match(appSource, /평가가 저장되었습니다/);
  assert.doesNotMatch(appSource, /evaluationCriteria|평가 기준/);
  assert.doesNotMatch(appSource, /Run Demo Flow|Save Seed Notice|Hide Seed Notice/);
});

test('seed companies, notices, and report copy are Korean', () => {
  const seed = createSeedData();

  assert.equal(seed.companies[0].name, '한강구매 주식회사');
  assert.equal(seed.companies[1].name, '서울공급웍스');
  assert.equal(seed.notices[0].title, '사무실 네트워크 고도화');
  assert.equal(seed.notices[0].category, '정보기술');
  assert.equal(seed.notices[0].requestFile.name, '사무실_네트워크_제안요청서.pdf');
  assert.match(seed.reports[0].reason, /예산 범위/);
});
