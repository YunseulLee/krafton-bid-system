import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('package declares dependency-free static build scripts without browser database dependencies', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(pkg.scripts.dev, 'node scripts/start-server.mjs');
  assert.equal(pkg.scripts.start, 'node scripts/start-server.mjs');
  assert.equal(pkg.scripts.build, 'node scripts/build-static.mjs');
  assert.equal(pkg.scripts.preview, 'node scripts/start-server.mjs');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs tests/**/*.test.mjs');
  assert.equal(pkg.dependencies?.['@supabase/supabase-js'], undefined);
  assert.equal(pkg.devDependencies?.vite, undefined);
});

test('static build script writes dist with browser-safe public environment', async () => {
  const script = await readFile('scripts/build-static.mjs', 'utf8');

  assert.match(script, /mkdir\(distDir/);
  assert.match(script, /copyRecursive\(.*src/);
  assert.match(script, /window\.__BID_ENV__/);
  assert.match(script, /VITE_BID_API_BASE_URL/);
  assert.match(script, /VITE_OPERATOR_LOGIN_REVIEW_MODE/);
});

test('start command points to an available local preview server script', async () => {
  const server = await readFile('scripts/start-server.mjs', 'utf8');

  assert.match(server, /createServer/);
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /입찰 플랫폼 미리보기/);
  assert.match(server, /dist/);
  assert.match(server, /renderPublicEnvScript/);
  assert.match(server, /VITE_BID_API_BASE_URL/);
  assert.match(server, /fallbackIndexPath/);
  assert.match(server, /operator/);
});

test('Kubernetes manifests describe EKS web, API, ingress, and cleanup jobs', async () => {
  const web = await readFile('infra/k8s/web-deployment.yaml', 'utf8');
  const api = await readFile('infra/k8s/api-deployment.yaml', 'utf8');
  const ingress = await readFile('infra/k8s/ingress.yaml', 'utf8');
  const cleanup = await readFile('infra/k8s/expired-supplier-cleanup-cronjob.yaml', 'utf8');
  const waf = await readFile('infra/aws-waf/operator-path-allowlist.json', 'utf8');

  assert.match(web, /kind:\s*Deployment/);
  assert.match(web, /name:\s*krafton-bid-web/);
  assert.match(web, /node", "scripts\/start-server\.mjs/);
  assert.match(web, /name:\s*HOST[\s\S]*value:\s*0\.0\.0\.0/);
  assert.match(web, /name:\s*PORT[\s\S]*value:\s*"8080"/);
  assert.match(api, /kind:\s*Deployment/);
  assert.match(api, /name:\s*krafton-bid-api/);
  assert.match(api, /AWS PostgreSQL|RDS PostgreSQL/);
  assert.match(ingress, /alb\.ingress\.kubernetes\.io/);
  assert.match(ingress, /\/operator/);
  assert.match(cleanup, /kind:\s*CronJob/);
  assert.match(cleanup, /expired-supplier-cleanup/);
  assert.match(cleanup, /timeZone:\s*Asia\/Seoul/);
  assert.match(cleanup, /postgres:16-alpine/);
  assert.match(cleanup, /psql/);
  assert.match(cleanup, /mark_expired_supplier_accounts_deleted/);
  assert.doesNotMatch(cleanup, /server\/jobs\/delete-expired-suppliers\.js/);
  assert.match(waf, /"DefaultAction"[\s\S]*"Allow"/);
  assert.match(waf, /"SearchString": "\/operator"/);
  assert.match(waf, /"SearchString": "operator=1"/);
  assert.match(waf, /"PositionalConstraint": "STARTS_WITH"/);
  assert.match(waf, /"IPSetReferenceStatement"/);
  assert.match(waf, /"Action"[\s\S]*"Block"/);
});

test('environment example documents only public EKS browser variables', async () => {
  const env = await readFile('.env.example', 'utf8');

  assert.match(env, /VITE_BID_API_BASE_URL=/);
  assert.match(env, /VITE_OPERATOR_LOGIN_REVIEW_MODE=/);
  assert.doesNotMatch(env, /SUPABASE|DATABASE_URL|PASSWORD|SERVICE_ROLE|SECRET|PRIVATE/);
});

test('deployment runbook covers AWS EKS, AWS PostgreSQL, Outlook, and manual acceptance', async () => {
  const runbook = await readFile('docs/deployment/aws-eks-postgresql.md', 'utf8');
  const migration = await readFile('postgres/migrations/001_bid_platform.sql', 'utf8');

  assert.match(runbook, /AWS EKS/);
  assert.match(runbook, /AWS PostgreSQL|RDS PostgreSQL/);
  assert.match(runbook, /Amazon S3/);
  assert.match(runbook, /AWS WAF|ALB/);
  assert.match(runbook, /Outlook/);
  assert.match(runbook, /원본 파일 장기 보관/);
  assert.match(runbook, /교체 이력/);
  assert.match(runbook, /입찰중/);
  assert.match(runbook, /14일 이후 자동 삭제/);
  assert.match(runbook, /notification complete/);
  assert.match(runbook, /no score, note, preferred\/rejected status, or proposal download link/);
  assert.match(migration, /create table if not exists app_users/i);
  assert.match(migration, /create table if not exists rfp_file_revisions/i);
  assert.match(migration, /create table if not exists proposal_file_revisions/i);
  assert.match(migration, /create or replace view expired_supplier_accounts/i);
  assert.match(migration, /mark_expired_supplier_accounts_deleted/i);
  assert.match(migration, /create or replace function validate_evaluation_write/i);
  assert.match(migration, /create trigger validate_evaluation_write/i);
  assert.match(migration, /create or replace function validate_notice_update/i);
  assert.match(migration, /create trigger validate_notice_update/i);
  assert.match(migration, /deadline_at cannot be shortened/i);
  assert.match(migration, /starts_at cannot change/i);
  assert.match(migration, /result_notified_at locks notice changes/i);
  assert.match(migration, /create or replace function validate_proposal_update/i);
  assert.match(migration, /create trigger validate_proposal_update/i);
  assert.match(migration, /notice_deadline_at <= now\(\)/i);
  assert.match(migration, /deadline_at <= now\(\)/i);
  assert.match(migration, /result_notified_at is not null/i);
  assert.match(migration, /all submitted proposals need evaluations/i);
  assert.doesNotMatch(migration, /storage_deleted_at/i);
});
