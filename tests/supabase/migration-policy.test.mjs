import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/001_bid_platform.sql';

async function readMigration() {
  return readFile(migrationPath, 'utf8');
}

function policySql(sql, policyName) {
  return sql.match(new RegExp(`create policy "${policyName}"[\\s\\S]*?;`, 'i'))?.[0] || '';
}

function functionSql(sql, functionName) {
  return sql.match(new RegExp(`create or replace function public\\.${functionName}\\(\\)[\\s\\S]*?\\$\\$;`, 'i'))?.[0] || '';
}

test('migration creates core bid tables and participant-safe projections', async () => {
  const sql = await readMigration();

  assert.match(sql, /create table if not exists public\.profiles/i);
  assert.match(sql, /create table if not exists public\.bid_notices/i);
  assert.match(sql, /create table if not exists public\.proposals/i);
  assert.match(sql, /create table if not exists public\.proposal_file_revisions/i);
  assert.match(sql, /supplier_id uuid/i);
  assert.match(sql, /supplier_company_name text/i);
  assert.match(sql, /storage_deleted_at timestamptz/i);
  assert.match(sql, /create table if not exists public\.evaluations/i);
  assert.match(sql, /create or replace view public\.participant_bid_notices/i);
  assert.match(sql, /create or replace view public\.participant_proposals/i);
  assert.match(sql.match(/create or replace view public\.participant_bid_notices[\s\S]*?;/i)?.[0] || '', /rfp_file_path/i);
  assert.doesNotMatch(sql.match(/create or replace view public\.participant_bid_notices[\s\S]*?;/i)?.[0] || '', /preferred_proposal_id|result_notified_at/i);
  assert.doesNotMatch(sql.match(/create or replace view public\.participant_proposals[\s\S]*?;/i)?.[0] || '', /selected|not_selected|score|note/i);
});

test('migration enables RLS and avoids browser service-role usage', async () => {
  const sql = await readMigration();

  assert.match(sql, /alter table public\.profiles enable row level security/i);
  assert.match(sql, /alter table public\.bid_notices enable row level security/i);
  assert.match(sql, /alter table public\.proposals enable row level security/i);
  assert.match(sql, /alter table public\.proposal_file_revisions enable row level security/i);
  assert.match(sql, /alter table public\.evaluations enable row level security/i);
  assert.match(sql, /create or replace function public\.is_operator/i);
  assert.match(sql, /create or replace function public\.is_supplier/i);
  assert.doesNotMatch(sql, /service_role/i);
});

test('migration prepares 14 day supplier login expiry for self signup', async () => {
  const sql = await readMigration();
  const supplierFunction = functionSql(sql, 'is_supplier');

  assert.match(sql, /login_expires_at timestamptz/i);
  assert.match(sql, /create or replace function public\.handle_new_auth_user/i);
  assert.match(sql, /after insert on auth\.users/i);
  assert.match(sql, /new\.raw_user_meta_data/i);
  assert.match(sql, /'supplier'/i);
  assert.match(supplierFunction, /login_expires_at is null or login_expires_at > now\(\)/i);
});

test('migration creates private storage buckets and deadline-gated proposal reads', async () => {
  const sql = await readMigration();

  assert.match(sql, /insert into storage\.buckets[\s\S]*rfp-files/i);
  assert.match(sql, /insert into storage\.buckets[\s\S]*proposal-files/i);
  assert.match(sql, /bucket_id = 'proposal-files'/i);
  assert.match(sql, /deadline_at < now\(\)/i);
  assert.match(sql, /storage\.foldername\(name\)\)\[4\] = auth\.uid\(\)::text/i);
});

test('proposal storage policies safely bind path notice ids to open notices and proposal rows', async () => {
  const sql = await readMigration();
  const uploadPolicy = policySql(sql, 'suppliers upload proposal files to own folder');
  const readPolicy = policySql(sql, 'operators read proposal files after deadline');
  const proposalDeletePolicy = policySql(sql, 'operators delete replaced proposal files after notification retention');
  const rfpDeletePolicy = policySql(sql, 'operators delete rfp files');

  assert.match(sql, /create or replace function public\.uuid_or_null/i);
  assert.match(sql, /create or replace function public\.list_expired_proposal_revision_files/i);
  assert.match(sql, /public\.uuid_or_null\(\(storage\.foldername\(name\)\)\[2\]\)/i);
  assert.doesNotMatch(sql, /\(\(storage\.foldername\(name\)\)\[2\]\)::uuid/i);
  assert.match(uploadPolicy, /starts_at <= now\(\)/i);
  assert.match(uploadPolicy, /deadline_at >= now\(\)/i);
  assert.match(uploadPolicy, /result_notified_at is null/i);
  assert.match(uploadPolicy, /storage\.foldername\(name\)\)\[4\] = auth\.uid\(\)::text/i);
  assert.match(readPolicy, /file_path = name/i);
  assert.match(readPolicy, /deadline_at < now\(\)/i);
  assert.match(rfpDeletePolicy, /bucket_id = 'rfp-files'/i);
  assert.match(rfpDeletePolicy, /public\.is_operator\(\)/i);
  assert.match(proposalDeletePolicy, /bucket_id = 'proposal-files'/i);
  assert.match(proposalDeletePolicy, /proposal_file_revisions/i);
  assert.match(proposalDeletePolicy, /result_notified_at is not null/i);
  assert.match(proposalDeletePolicy, /interval '30 days'/i);
});

test('migration adds database workflow guards for evaluations and notice results', async () => {
  const sql = await readMigration();
  const noticeGuard = functionSql(sql, 'validate_notice_update');

  assert.match(sql, /create or replace function public\.validate_evaluation_write/i);
  assert.match(sql, /create trigger validate_evaluation_write/i);
  assert.match(sql, /create or replace function public\.validate_notice_update/i);
  assert.match(sql, /create trigger validate_notice_update/i);
  assert.match(sql, /before insert or update on public\.bid_notices/i);
  assert.match(noticeGuard, /tg_op = 'insert'/i);
  assert.match(noticeGuard, /preferred_proposal_id/i);
  assert.match(noticeGuard, /result_notified_at/i);
  assert.match(noticeGuard, /deadline_at < now\(\)/i);
  assert.match(noticeGuard, /result_notified_at is not null/i);
  assert.match(noticeGuard, /proposal\.notice_id/i);
  assert.match(noticeGuard, /not exists[\s\S]*evaluations/i);
});

test('migration prevents direct operator proposal update bypasses', async () => {
  const sql = await readMigration();
  const proposalUpdatePolicy = policySql(sql, 'operators update proposal status after validation');
  const supplierReplacePolicy = policySql(sql, 'suppliers replace own proposal files before deadline');
  const proposalGuard = functionSql(sql, 'validate_proposal_update');

  assert.match(sql, /create or replace function public\.validate_proposal_update/i);
  assert.match(sql, /create trigger validate_proposal_update/i);
  assert.match(sql, /create or replace function public\.record_proposal_file_revision/i);
  assert.match(sql, /old\.supplier_id/i);
  assert.match(sql, /old\.supplier_company_name/i);
  assert.match(sql, /create trigger record_proposal_file_revision/i);
  assert.match(sql, /before update on public\.proposals/i);
  assert.match(proposalGuard, /new\.id\s+is distinct from\s+old\.id/i);
  assert.match(proposalGuard, /new\.notice_id\s+is distinct from\s+old\.notice_id/i);
  assert.match(proposalGuard, /new\.supplier_id\s+is distinct from\s+old\.supplier_id/i);
  assert.match(proposalGuard, /new\.supplier_company_name\s+is distinct from\s+old\.supplier_company_name/i);
  assert.match(proposalGuard, /new\.submitted_at\s+is distinct from\s+old\.submitted_at/i);
  assert.match(proposalGuard, /file_changed/i);
  assert.match(proposalGuard, /public\.is_supplier\(\)/i);
  assert.match(proposalGuard, /new\.supplier_id <> auth\.uid\(\)/i);
  assert.match(proposalGuard, /new\.status in \('selected', 'not_selected'\)/i);
  assert.match(proposalGuard, /result_notified_at is not null/i);
  assert.match(proposalGuard, /deadline_at >= now\(\)/i);
  assert.match(proposalGuard, /not exists[\s\S]*evaluations/i);
  assert.match(proposalUpdatePolicy, /status in \('selected', 'not_selected'\)/i);
  assert.match(supplierReplacePolicy, /supplier_id = auth\.uid\(\)/i);
  assert.match(supplierReplacePolicy, /status = 'submitted'/i);
  assert.match(supplierReplacePolicy, /deadline_at >= now\(\)/i);
  assert.doesNotMatch(sql, /create policy "operators update proposal results"/i);
  assert.doesNotMatch(
    proposalUpdatePolicy,
    /using\s*\(\s*public\.is_operator\(\)\s*\)\s*with check\s*\(\s*public\.is_operator\(\)\s*\)/i,
  );
});

test('migration is rerunnable and keeps profiles read-only for authenticated clients', async () => {
  const sql = await readMigration();

  assert.match(sql, /drop policy if exists/i);
  assert.match(sql, /pg_constraint/i);
  assert.match(sql, /grant select on public\.profiles to authenticated/i);
  assert.doesNotMatch(sql, /grant select, insert, update on public\.profiles/i);
});
