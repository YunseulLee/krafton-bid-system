# Supabase Vercel Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Korean bid-system prototype into a Vercel-deployable Vite app backed by Supabase Auth, Postgres, and private Storage.

**Architecture:** Keep the existing pure domain/rendering code as the stable UI layer, add a Supabase client and async store adapter beside the current in-memory store, then switch the browser app to the Supabase-backed store. Use SQL RLS and participant-safe projections so participants never see scores, notes, proposal result classification, or proposal file downloads.

**Tech Stack:** Vite, vanilla ES modules, Supabase JS, Supabase Auth, Supabase Postgres, Supabase Storage, Vercel static deployment, Node test runner.

---

## Scope Check

This is one implementation plan. It covers deployment shell, database/storage security, Supabase client setup, Supabase-backed app operations, and UI wiring. Outlook send/receive stays outside the app.

## File Structure

- Create `vite.config.js`: Vite build configuration.
- Create `vercel.json`: single-page app rewrite configuration for Vercel.
- Create `.env.example`: required public Supabase environment variables.
- Create `supabase/migrations/001_bid_platform.sql`: schema, RLS, views, Storage bucket setup, and policies.
- Create `src/integrations/supabase/config.js`: reads and validates Vite environment variables.
- Create `src/integrations/supabase/client.js`: lazily loads `@supabase/supabase-js` and creates the browser client.
- Create `src/app/supabase-storage-paths.js`: creates deterministic safe Storage paths.
- Create `src/app/supabase-mappers.js`: maps Supabase rows into the current render state shape.
- Create `src/app/supabase-bid-store.js`: Supabase-backed operations for auth, dashboard loading, notice creation, file upload, evaluation, selection, and notification completion.
- Modify `package.json`: add Vite and Supabase dependency metadata and deployment scripts.
- Modify `src/ui/app.js`: use email/password login and async store actions.
- Modify `src/ui/render.js`: keep role-specific rendering and support Supabase download URLs.
- Create focused tests under `tests/deploy`, `tests/supabase`, and `tests/app`.

## Current Constraints

- The current environment has blocked git index writes once with `.git/index.lock: Operation not permitted`. If commit steps fail with that exact permission error, record the failure and continue to the next task without retrying destructive git commands.
- Network access is restricted. Adding dependencies to `package.json` is still required for Vercel. Local `npm run build` may require a separate `npm install` in an environment with package installation available.

---

### Task 1: Vite and Vercel Deployment Shell

**Files:**
- Modify: `package.json`
- Create: `scripts/start-server.mjs`
- Create: `vite.config.js`
- Create: `vercel.json`
- Create: `.env.example`
- Create: `tests/deploy/vercel-vite-config.test.mjs`

- [ ] **Step 1: Write the failing deployment config test**

Create `tests/deploy/vercel-vite-config.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('package declares Vite build scripts and Supabase dependency metadata', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(pkg.scripts.dev, 'vite --host 127.0.0.1');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts.preview, 'vite preview --host 127.0.0.1');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs tests/**/*.test.mjs');
  assert.match(pkg.dependencies['@supabase/supabase-js'], /^\^/);
  assert.match(pkg.devDependencies.vite, /^\^/);
});

test('Vercel routes browser refreshes to the Vite app shell', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));

  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});

test('environment example documents only public Supabase browser variables', async () => {
  const env = await readFile('.env.example', 'utf8');

  assert.match(env, /VITE_SUPABASE_URL=/);
  assert.match(env, /VITE_SUPABASE_ANON_KEY=/);
  assert.doesNotMatch(env, /SERVICE_ROLE|SECRET|PRIVATE/);
});
```

- [ ] **Step 2: Run the failing deployment config test**

Run:

```bash
npm test -- tests/deploy/vercel-vite-config.test.mjs
```

Expected: fails because `vercel.json`, `.env.example`, Vite scripts, and dependency metadata do not exist yet.

- [ ] **Step 3: Add deployment configuration**

Update `package.json` to this structure while preserving the current package name/version:

```json
{
  "name": "bid-platform-mvp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "start": "node scripts/start-server.mjs",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --test tests/*.test.mjs tests/**/*.test.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1"
  },
  "devDependencies": {
    "vite": "^6.2.0"
  }
}
```

Create `vite.config.js`:

```js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
```

Create `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Create `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

- [ ] **Step 4: Verify the deployment config test passes**

Run:

```bash
npm test -- tests/deploy/vercel-vite-config.test.mjs
```

Expected: pass.

- [ ] **Step 5: Commit deployment shell changes**

Run:

```bash
git add package.json scripts/start-server.mjs vite.config.js vercel.json .env.example tests/deploy/vercel-vite-config.test.mjs
git commit -m "chore: add vite vercel deployment shell"
```

Expected: commit succeeds. If git index writes are blocked by the sandbox, record the exact permission error in the handoff.

---

### Task 2: Supabase Schema, RLS, and Storage Policies

**Files:**
- Create: `supabase/migrations/001_bid_platform.sql`
- Create: `tests/supabase/migration-policy.test.mjs`

- [ ] **Step 1: Write the failing SQL policy test**

Create `tests/supabase/migration-policy.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/001_bid_platform.sql';

test('migration creates core bid tables and participant-safe projections', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create table if not exists public\.profiles/i);
  assert.match(sql, /create table if not exists public\.bid_notices/i);
  assert.match(sql, /create table if not exists public\.proposals/i);
  assert.match(sql, /create table if not exists public\.evaluations/i);
  assert.match(sql, /create view public\.participant_bid_notices/i);
  assert.match(sql, /create view public\.participant_proposals/i);
  assert.doesNotMatch(sql.match(/create view public\.participant_bid_notices[\s\S]*?;/i)?.[0] || '', /preferred_proposal_id|result_notified_at/i);
  assert.doesNotMatch(sql.match(/create view public\.participant_proposals[\s\S]*?;/i)?.[0] || '', /selected|not_selected|score|note/i);
});

test('migration enables RLS and avoids browser service-role usage', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /alter table public\.profiles enable row level security/i);
  assert.match(sql, /alter table public\.bid_notices enable row level security/i);
  assert.match(sql, /alter table public\.proposals enable row level security/i);
  assert.match(sql, /alter table public\.evaluations enable row level security/i);
  assert.match(sql, /create or replace function public\.is_operator/i);
  assert.match(sql, /create or replace function public\.is_supplier/i);
  assert.doesNotMatch(sql, /service_role/i);
});

test('migration creates private storage buckets and deadline-gated proposal reads', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /insert into storage\.buckets[\s\S]*rfp-files/i);
  assert.match(sql, /insert into storage\.buckets[\s\S]*proposal-files/i);
  assert.match(sql, /bucket_id = 'proposal-files'/i);
  assert.match(sql, /deadline_at < now\(\)/i);
  assert.match(sql, /storage\.foldername\(name\)\)\[4\] = auth\.uid\(\)::text/i);
});
```

- [ ] **Step 2: Run the failing SQL policy test**

Run:

```bash
npm test -- tests/supabase/migration-policy.test.mjs
```

Expected: fails because `supabase/migrations/001_bid_platform.sql` does not exist.

- [ ] **Step 3: Create the migration SQL**

Create `supabase/migrations/001_bid_platform.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  company_name text not null,
  role text not null check (role in ('supplier', 'operator')),
  created_at timestamptz not null default now()
);

create table if not exists public.bid_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  summary text not null,
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null default 'published' check (status in ('published', 'ended')),
  rfp_file_path text not null,
  rfp_file_name text not null,
  rfp_file_size bigint not null default 0,
  created_by uuid not null references public.profiles(id),
  preferred_proposal_id uuid null,
  result_notified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bid_notices_valid_period check (starts_at < deadline_at)
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.bid_notices(id) on delete cascade,
  supplier_id uuid not null references public.profiles(id),
  supplier_company_name text not null,
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  status text not null default 'submitted' check (status in ('submitted', 'selected', 'not_selected')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notice_id, supplier_id)
);

alter table public.bid_notices
  add constraint bid_notices_preferred_proposal_fk
  foreign key (preferred_proposal_id)
  references public.proposals(id)
  deferrable initially deferred;

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  notice_id uuid not null references public.bid_notices(id) on delete cascade,
  evaluator_id uuid not null references public.profiles(id),
  score numeric not null check (score >= 0 and score <= 100),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id)
);

create index if not exists bid_notices_deadline_idx on public.bid_notices(deadline_at);
create index if not exists proposals_notice_idx on public.proposals(notice_id);
create index if not exists evaluations_notice_idx on public.evaluations(notice_id);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() = 'operator'
$$;

create or replace function public.is_supplier()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() = 'supplier'
$$;

create or replace view public.participant_bid_notices
with (security_barrier = true)
as
select
  id,
  title,
  category,
  summary,
  starts_at,
  deadline_at,
  status,
  rfp_file_name,
  rfp_file_size
from public.bid_notices
where status = 'published';

create or replace view public.participant_proposals
with (security_barrier = true)
as
select
  id,
  notice_id,
  supplier_id,
  file_name,
  file_size,
  submitted_at,
  'submitted'::text as display_status
from public.proposals
where supplier_id = auth.uid();

alter table public.profiles enable row level security;
alter table public.bid_notices enable row level security;
alter table public.proposals enable row level security;
alter table public.evaluations enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.bid_notices from anon, authenticated;
revoke all on public.proposals from anon, authenticated;
revoke all on public.evaluations from anon, authenticated;
grant select on public.participant_bid_notices to authenticated;
grant select on public.participant_proposals to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.bid_notices to authenticated;
grant insert, select, update on public.proposals to authenticated;
grant select, insert, update on public.evaluations to authenticated;

create policy "profiles read own or operator"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_operator());

create policy "operators manage notices"
on public.bid_notices for all to authenticated
using (public.is_operator())
with check (public.is_operator());

create policy "suppliers submit proposals"
on public.proposals for insert to authenticated
with check (
  public.is_supplier()
  and supplier_id = auth.uid()
  and exists (
    select 1
    from public.bid_notices notice
    where notice.id = notice_id
      and notice.status = 'published'
      and notice.starts_at <= now()
      and notice.deadline_at >= now()
      and notice.result_notified_at is null
  )
);

create policy "operators read proposals after deadline"
on public.proposals for select to authenticated
using (
  public.is_operator()
  and exists (
    select 1 from public.bid_notices notice
    where notice.id = notice_id
      and notice.deadline_at < now()
  )
);

create policy "operators update proposal results"
on public.proposals for update to authenticated
using (public.is_operator())
with check (public.is_operator());

create policy "operators read evaluations"
on public.evaluations for select to authenticated
using (public.is_operator());

create policy "operators create evaluations"
on public.evaluations for insert to authenticated
with check (public.is_operator());

create policy "operators update evaluations"
on public.evaluations for update to authenticated
using (public.is_operator())
with check (public.is_operator());

insert into storage.buckets (id, name, public)
values
  ('rfp-files', 'rfp-files', false),
  ('proposal-files', 'proposal-files', false)
on conflict (id) do nothing;

create policy "operators upload rfp files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'rfp-files'
  and public.is_operator()
);

create policy "authenticated users read rfp files"
on storage.objects for select to authenticated
using (bucket_id = 'rfp-files');

create policy "suppliers upload proposal files to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'proposal-files'
  and public.is_supplier()
  and (storage.foldername(name))[1] = 'notices'
  and (storage.foldername(name))[3] = 'suppliers'
  and (storage.foldername(name))[4] = auth.uid()::text
);

create policy "operators read proposal files after deadline"
on storage.objects for select to authenticated
using (
  bucket_id = 'proposal-files'
  and public.is_operator()
  and exists (
    select 1
    from public.bid_notices notice
    where notice.id = ((storage.foldername(name))[2])::uuid
      and notice.deadline_at < now()
  )
);
```

- [ ] **Step 4: Verify the SQL policy test passes**

Run:

```bash
npm test -- tests/supabase/migration-policy.test.mjs
```

Expected: pass.

- [ ] **Step 5: Commit migration changes**

Run:

```bash
git add supabase/migrations/001_bid_platform.sql tests/supabase/migration-policy.test.mjs
git commit -m "feat: add supabase schema and policies"
```

Expected: commit succeeds, unless the sandbox blocks git index writes.

---

### Task 3: Supabase Environment Config and Browser Client

**Files:**
- Create: `src/integrations/supabase/config.js`
- Create: `src/integrations/supabase/client.js`
- Create: `tests/supabase/client-config.test.mjs`

- [ ] **Step 1: Write the failing Supabase config test**

Create `tests/supabase/client-config.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the failing Supabase config test**

Run:

```bash
npm test -- tests/supabase/client-config.test.mjs
```

Expected: fails because `src/integrations/supabase/config.js` does not exist.

- [ ] **Step 3: Implement config and lazy client creation**

Create `src/integrations/supabase/config.js`:

```js
export function getSupabaseConfig(env = import.meta.env || {}) {
  const url = env.VITE_SUPABASE_URL || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY || '';
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}

export function createMissingSupabaseConfigMessage() {
  return 'Supabase 환경변수가 설정되지 않았습니다. VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정한 뒤 다시 배포하세요.';
}
```

Create `src/integrations/supabase/client.js`:

```js
import { getSupabaseConfig } from './config.js';

export async function createSupabaseBrowserClient(env = import.meta.env || {}) {
  const config = getSupabaseConfig(env);
  if (!config.configured) return { client: null, config };

  const { createClient } = await import('@supabase/supabase-js');
  return {
    client: createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }),
    config,
  };
}
```

- [ ] **Step 4: Verify the Supabase config test passes**

Run:

```bash
npm test -- tests/supabase/client-config.test.mjs
```

Expected: pass without requiring `@supabase/supabase-js` to be installed, because the test does not invoke the lazy import.

- [ ] **Step 5: Commit Supabase client setup**

Run:

```bash
git add src/integrations/supabase/config.js src/integrations/supabase/client.js tests/supabase/client-config.test.mjs
git commit -m "feat: add supabase browser client config"
```

Expected: commit succeeds, unless the sandbox blocks git index writes.

---

### Task 4: Supabase Storage Paths and Row Mappers

**Files:**
- Create: `src/app/supabase-storage-paths.js`
- Create: `src/app/supabase-mappers.js`
- Create: `tests/app/supabase-storage-paths.test.mjs`
- Create: `tests/app/supabase-mappers.test.mjs`

- [ ] **Step 1: Write failing tests for Storage paths**

Create `tests/app/supabase-storage-paths.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProposalFilePath, createRfpFilePath, sanitizeFileName } from '../../src/app/supabase-storage-paths.js';

test('sanitizeFileName keeps Korean names and removes path separators', () => {
  assert.equal(sanitizeFileName('../사무실 제안요청서.pdf'), '사무실_제안요청서.pdf');
  assert.equal(sanitizeFileName('proposal final (v1).zip'), 'proposal_final_v1.zip');
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
```

- [ ] **Step 2: Write failing tests for row mappers**

Create `tests/app/supabase-mappers.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapNoticeRow, mapProfileRow, mapProposalRow } from '../../src/app/supabase-mappers.js';

test('mapProfileRow converts Supabase roles to render roles', () => {
  assert.deepEqual(mapProfileRow({
    id: 'user-1',
    email: 'supplier@example.com',
    name: '홍길동',
    company_name: '서울공급웍스',
    role: 'supplier',
  }), {
    id: 'user-1',
    email: 'supplier@example.com',
    name: '홍길동',
    role: 'Supplier',
    companyId: 'company-user-1',
    companyName: '서울공급웍스',
  });
});

test('mapNoticeRow converts file metadata and published status', () => {
  const notice = mapNoticeRow({
    id: 'notice-1',
    title: '공고',
    category: 'IT',
    summary: '요약',
    starts_at: '2026-06-24T09:00:00.000Z',
    deadline_at: '2026-07-01T09:00:00.000Z',
    status: 'published',
    rfp_file_name: '요청서.pdf',
    rfp_file_size: 1024,
    rfp_download_url: 'https://signed-url.example/rfp',
    preferred_proposal_id: null,
    result_notified_at: null,
  });

  assert.equal(notice.status, 'Published');
  assert.equal(notice.requestFile.name, '요청서.pdf');
  assert.equal(notice.requestFile.url, 'https://signed-url.example/rfp');
});

test('mapProposalRow hides result classification in participant mode', () => {
  const proposal = mapProposalRow({
    id: 'proposal-1',
    notice_id: 'notice-1',
    supplier_id: 'supplier-1',
    supplier_company_name: '서울공급웍스',
    file_name: '제안서.pdf',
    file_size: 2048,
    file_download_url: '',
    status: 'selected',
    submitted_at: '2026-06-25T09:00:00.000Z',
  }, { participantSafe: true });

  assert.equal(proposal.status, 'Submitted');
  assert.equal(proposal.file.name, '제안서.pdf');
  assert.equal(proposal.file.url, '');
});
```

- [ ] **Step 3: Run the failing mapper/path tests**

Run:

```bash
npm test -- tests/app/supabase-storage-paths.test.mjs tests/app/supabase-mappers.test.mjs
```

Expected: fails because helper files do not exist.

- [ ] **Step 4: Implement Storage path helpers**

Create `src/app/supabase-storage-paths.js`:

```js
export function sanitizeFileName(fileName) {
  return String(fileName || 'file')
    .replaceAll(/[\\/]/g, '')
    .replaceAll(/^\.+/g, '')
    .replaceAll(/[^\p{L}\p{N}._-]+/gu, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '') || 'file';
}

export function createTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(/[-:TZ.]/g, '').slice(0, 14);
}

export function createRfpFilePath({ noticeId, fileName, timestamp = createTimestamp() }) {
  return `notices/${noticeId}/${timestamp}-${sanitizeFileName(fileName)}`;
}

export function createProposalFilePath({ noticeId, supplierId, fileName, timestamp = createTimestamp() }) {
  return `notices/${noticeId}/suppliers/${supplierId}/${timestamp}-${sanitizeFileName(fileName)}`;
}
```

- [ ] **Step 5: Implement row mappers**

Create `src/app/supabase-mappers.js`:

```js
const roleMap = {
  supplier: 'Supplier',
  operator: 'Operator',
};

const noticeStatusMap = {
  published: 'Published',
  ended: 'Ended',
};

const proposalStatusMap = {
  submitted: 'Submitted',
  selected: 'Selected',
  not_selected: 'NotSelected',
};

export function mapProfileRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: roleMap[row.role] || row.role,
    companyId: `company-${row.id}`,
    companyName: row.company_name,
  };
}

export function mapCompanyFromProfile(profile) {
  return {
    id: profile.companyId,
    name: profile.companyName,
    type: profile.role === 'Operator' ? 'Buyer' : 'Supplier',
    status: 'Approved',
  };
}

export function mapNoticeRow(row) {
  return {
    id: row.id,
    buyerCompanyId: 'platform-operator',
    title: row.title,
    category: row.category,
    summary: row.summary,
    requirements: row.summary,
    startsAt: row.starts_at,
    deadlineAt: row.deadline_at,
    requestFile: {
      name: row.rfp_file_name,
      size: row.rfp_file_size || 0,
      type: 'application/octet-stream',
      url: row.rfp_download_url || '',
    },
    status: noticeStatusMap[row.status] || row.status,
    awardedProposalId: row.preferred_proposal_id || null,
    resultNotifiedAt: row.result_notified_at || null,
  };
}

export function mapProposalRow(row, { participantSafe = false } = {}) {
  return {
    id: row.id,
    bidNoticeId: row.notice_id,
    supplierCompanyId: `company-${row.supplier_id}`,
    submittedByMemberId: row.supplier_id,
    supplierCompanyName: row.supplier_company_name || '',
    price: null,
    deliverySchedule: '',
    proposalText: '제안서 파일로 제출했습니다.',
    file: {
      name: row.file_name,
      size: row.file_size || 0,
      type: 'application/octet-stream',
      url: row.file_download_url || '',
    },
    status: participantSafe ? 'Submitted' : (proposalStatusMap[row.status] || row.status),
    submittedAt: row.submitted_at,
  };
}

export function mapEvaluationRow(row) {
  return {
    id: row.id,
    bidNoticeId: row.notice_id,
    proposalId: row.proposal_id,
    evaluatorMemberId: row.evaluator_id,
    priceScore: row.score,
    technicalScore: 0,
    scheduleScore: 0,
    note: row.note || '',
    totalScore: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 6: Verify mapper/path tests pass**

Run:

```bash
npm test -- tests/app/supabase-storage-paths.test.mjs tests/app/supabase-mappers.test.mjs
```

Expected: pass.

- [ ] **Step 7: Commit mapper/path changes**

Run:

```bash
git add src/app/supabase-storage-paths.js src/app/supabase-mappers.js tests/app/supabase-storage-paths.test.mjs tests/app/supabase-mappers.test.mjs
git commit -m "feat: add supabase storage helpers and mappers"
```

Expected: commit succeeds, unless the sandbox blocks git index writes.

---

### Task 5: Supabase Bid Store Adapter

**Files:**
- Create: `src/app/supabase-bid-store.js`
- Create: `tests/app/supabase-bid-store.test.mjs`

- [ ] **Step 1: Write the failing Supabase store test**

Create `tests/app/supabase-bid-store.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupabaseBidStore } from '../../src/app/supabase-bid-store.js';

function createQueryResult(data) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    single() { return Promise.resolve({ data, error: null }); },
    maybeSingle() { return Promise.resolve({ data, error: null }); },
    insert(payload) {
      query.payload = payload;
      return query;
    },
    update(payload) {
      query.payload = payload;
      return query;
    },
  };
  query.then = (resolve) => resolve({ data, error: null });
  return query;
}

test('loadSession returns signed out state when Supabase has no user', async () => {
  const store = createSupabaseBidStore({
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    },
  });

  assert.deepEqual(await store.loadSession(), { status: 'signed_out' });
});

test('loadSession maps authenticated profile into app member state', async () => {
  const store = createSupabaseBidStore({
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from(table) {
        assert.equal(table, 'profiles');
        return createQueryResult({
          id: 'user-1',
          email: 'operator@example.com',
          name: '운영자',
          company_name: '플랫폼',
          role: 'operator',
        });
      },
    },
  });

  const session = await store.loadSession();

  assert.equal(session.status, 'signed_in');
  assert.equal(session.member.role, 'Operator');
  assert.equal(session.member.companyName, '플랫폼');
});
```

- [ ] **Step 2: Run the failing Supabase store test**

Run:

```bash
npm test -- tests/app/supabase-bid-store.test.mjs
```

Expected: fails because `src/app/supabase-bid-store.js` does not exist.

- [ ] **Step 3: Implement the first Supabase store methods**

Create `src/app/supabase-bid-store.js` with the session and utility foundation:

```js
import { mapCompanyFromProfile, mapEvaluationRow, mapNoticeRow, mapProfileRow, mapProposalRow } from './supabase-mappers.js';
import { createProposalFilePath, createRfpFilePath, createTimestamp } from './supabase-storage-paths.js';

function assertSupabaseResult(result, fallbackMessage) {
  if (result?.error) {
    throw new Error(result.error.message || fallbackMessage);
  }
  return result?.data;
}

async function createSignedUrl(supabase, bucket, path) {
  if (!path) return '';
  const result = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  if (result.error) return '';
  return result.data?.signedUrl || '';
}

export function createSupabaseBidStore({ supabase, nowProvider = () => new Date() }) {
  async function loadProfile(userId) {
    const result = await supabase
      .from('profiles')
      .select('id,email,name,company_name,role')
      .eq('id', userId)
      .single();
    return mapProfileRow(assertSupabaseResult(result, '프로필을 불러오지 못했습니다.'));
  }

  return {
    async loadSession() {
      const result = await supabase.auth.getUser();
      assertSupabaseResult(result, '로그인 정보를 확인하지 못했습니다.');
      const user = result.data?.user;
      if (!user) return { status: 'signed_out' };
      const member = await loadProfile(user.id);
      return { status: 'signed_in', member };
    },

    async signIn(email, password) {
      const result = await supabase.auth.signInWithPassword({ email, password });
      assertSupabaseResult(result, '로그인에 실패했습니다.');
      return this.loadSession();
    },

    async signOut() {
      const result = await supabase.auth.signOut();
      assertSupabaseResult(result, '로그아웃에 실패했습니다.');
      return { status: 'signed_out' };
    },

    async loadDashboard(member) {
      const noticesTable = member.role === 'Operator' ? 'bid_notices' : 'participant_bid_notices';
      const noticesResult = await supabase
        .from(noticesTable)
        .select('*')
        .order('deadline_at', { ascending: true });
      const noticeRows = assertSupabaseResult(noticesResult, '공고 목록을 불러오지 못했습니다.') || [];
      const notices = [];
      for (const row of noticeRows) {
        const rfpUrl = row.rfp_file_path ? await createSignedUrl(supabase, 'rfp-files', row.rfp_file_path) : '';
        notices.push(mapNoticeRow({ ...row, rfp_download_url: rfpUrl }));
      }

      const proposalTable = member.role === 'Operator' ? 'proposals' : 'participant_proposals';
      const proposalsResult = member.role === 'Operator'
        ? await supabase.from(proposalTable).select('*').order('submitted_at', { ascending: true })
        : await supabase.from(proposalTable).select('*').eq('supplier_id', member.id).order('submitted_at', { ascending: true });
      const proposalRows = assertSupabaseResult(proposalsResult, '제안서 목록을 불러오지 못했습니다.') || [];
      const proposals = proposalRows.map((row) => mapProposalRow(row, { participantSafe: member.role !== 'Operator' }));

      const evaluations = member.role === 'Operator'
        ? (assertSupabaseResult(await supabase.from('evaluations').select('*'), '평가 목록을 불러오지 못했습니다.') || []).map(mapEvaluationRow)
        : [];

      const companies = [mapCompanyFromProfile(member)];
      return {
        members: [member],
        companies,
        notices,
        proposals,
        evaluations,
        activity: [],
        savedNotices: [],
        reports: [],
      };
    },

    async createOperatorNotice(member, input) {
      const timestamp = createTimestamp(nowProvider());
      const noticeId = crypto.randomUUID();
      const rfpPath = createRfpFilePath({ noticeId, fileName: input.requestFile.name, timestamp });
      const upload = await supabase.storage.from('rfp-files').upload(rfpPath, input.requestFile, { upsert: false });
      assertSupabaseResult(upload, '제안요청서 업로드에 실패했습니다.');

      const insert = await supabase
        .from('bid_notices')
        .insert({
          id: noticeId,
          title: input.title,
          category: input.category,
          summary: input.summary,
          starts_at: input.startsAt,
          deadline_at: input.deadlineAt,
          status: 'published',
          rfp_file_path: rfpPath,
          rfp_file_name: input.requestFile.name,
          rfp_file_size: input.requestFile.size || 0,
          created_by: member.id,
        })
        .select()
        .single();
      return mapNoticeRow(assertSupabaseResult(insert, '공고 등록에 실패했습니다.'));
    },

    async submitProposalFile(member, noticeId, file) {
      const timestamp = createTimestamp(nowProvider());
      const filePath = createProposalFilePath({ noticeId, supplierId: member.id, fileName: file.name, timestamp });
      const upload = await supabase.storage.from('proposal-files').upload(filePath, file, { upsert: false });
      assertSupabaseResult(upload, '제안서 업로드에 실패했습니다.');

      const insert = await supabase
        .from('proposals')
        .insert({
          notice_id: noticeId,
          supplier_id: member.id,
          supplier_company_name: member.companyName,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size || 0,
          status: 'submitted',
        })
        .select()
        .single();
      return mapProposalRow(assertSupabaseResult(insert, '제안서 제출에 실패했습니다.'), { participantSafe: true });
    },

    async evaluateSubmission(member, proposalId, input) {
      const proposal = assertSupabaseResult(
        await supabase.from('proposals').select('notice_id').eq('id', proposalId).single(),
        '제안서를 찾지 못했습니다.'
      );
      const upsert = await supabase
        .from('evaluations')
        .insert({
          proposal_id: proposalId,
          notice_id: proposal.notice_id,
          evaluator_id: member.id,
          score: input.score,
          note: input.note || '',
        })
        .select()
        .single();
      return mapEvaluationRow(assertSupabaseResult(upsert, '평가 저장에 실패했습니다.'));
    },

    async selectPreferredProposal(proposalId, noticeId) {
      const proposals = assertSupabaseResult(
        await supabase.from('proposals').select('id').eq('notice_id', noticeId),
        '제출 업체를 확인하지 못했습니다.'
      ) || [];
      const evaluations = assertSupabaseResult(
        await supabase.from('evaluations').select('proposal_id').eq('notice_id', noticeId),
        '평가 목록을 확인하지 못했습니다.'
      ) || [];
      const evaluatedIds = new Set(evaluations.map((item) => item.proposal_id));
      if (proposals.length === 0 || !proposals.every((item) => evaluatedIds.has(item.id))) {
        throw new Error('모든 제출 업체의 평가를 저장한 뒤 우선대상자를 선택할 수 있습니다.');
      }

      const noticeUpdate = await supabase
        .from('bid_notices')
        .update({ preferred_proposal_id: proposalId })
        .eq('id', noticeId)
        .select()
        .single();
      assertSupabaseResult(noticeUpdate, '우선대상자 선택에 실패했습니다.');

      for (const proposal of proposals) {
        const status = proposal.id === proposalId ? 'selected' : 'not_selected';
        assertSupabaseResult(
          await supabase.from('proposals').update({ status }).eq('id', proposal.id),
          '제안서 결과 상태 저장에 실패했습니다.'
        );
      }
      return true;
    },

    async markResultNotificationComplete(noticeId) {
      const result = await supabase
        .from('bid_notices')
        .update({ result_notified_at: nowProvider().toISOString() })
        .eq('id', noticeId)
        .select()
        .single();
      return mapNoticeRow(assertSupabaseResult(result, '통보 완료 상태 저장에 실패했습니다.'));
    },
  };
}
```

- [ ] **Step 4: Verify the initial Supabase store test passes**

Run:

```bash
npm test -- tests/app/supabase-bid-store.test.mjs
```

Expected: pass.

- [ ] **Step 5: Add focused tests for action methods**

Extend `tests/app/supabase-bid-store.test.mjs` with fake Supabase objects for:

```js
test('submitProposalFile uploads to proposal-files and inserts safe proposal metadata', async () => {
  const calls = [];
  const store = createSupabaseBidStore({
    nowProvider: () => new Date('2026-06-24T09:30:00.000Z'),
    supabase: {
      storage: {
        from(bucket) {
          return {
            upload: async (path, file) => {
              calls.push({ bucket, path, fileName: file.name });
              return { data: { path }, error: null };
            },
          };
        },
      },
      from(table) {
        return {
          insert(payload) {
            calls.push({ table, payload });
            return {
              select() { return this; },
              single: async () => ({
                data: {
                  id: 'proposal-1',
                  ...payload,
                  supplier_company_name: payload.supplier_company_name,
                  file_name: payload.file_name,
                  file_size: payload.file_size,
                  submitted_at: '2026-06-24T09:30:00.000Z',
                },
                error: null,
              }),
            };
          },
        };
      },
    },
  });

  await store.submitProposalFile(
    { id: 'supplier-1', companyName: '서울공급웍스' },
    'notice-1',
    { name: '제안서.pdf', size: 1000 }
  );

  assert.equal(calls[0].bucket, 'proposal-files');
  assert.equal(calls[0].path, 'notices/notice-1/suppliers/supplier-1/20260624093000-제안서.pdf');
  assert.equal(calls[1].table, 'proposals');
  assert.equal(calls[1].payload.status, 'submitted');
});
```

- [ ] **Step 6: Run store tests again**

Run:

```bash
npm test -- tests/app/supabase-bid-store.test.mjs
```

Expected: pass.

- [ ] **Step 7: Commit Supabase store adapter**

Run:

```bash
git add src/app/supabase-bid-store.js tests/app/supabase-bid-store.test.mjs
git commit -m "feat: add supabase bid store adapter"
```

Expected: commit succeeds, unless the sandbox blocks git index writes.

---

### Task 6: Async Supabase Login and Dashboard Wiring

**Files:**
- Modify: `src/ui/app.js`
- Create: `tests/ui/app-supabase-auth-shell.test.mjs`

- [ ] **Step 1: Write the failing auth shell source test**

Create `tests/ui/app-supabase-auth-shell.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('browser app uses Supabase email login instead of demo role buttons', async () => {
  const source = await readFile('src/ui/app.js', 'utf8');

  assert.match(source, /createSupabaseBrowserClient/);
  assert.match(source, /createSupabaseBidStore/);
  assert.match(source, /name="email"/);
  assert.match(source, /name="password"/);
  assert.match(source, /data-action="login"/);
  assert.match(source, /signIn/);
  assert.match(source, /signOut/);
  assert.doesNotMatch(source, /loginMembers/);
  assert.doesNotMatch(source, /data-login-role/);
});
```

- [ ] **Step 2: Run the failing auth shell test**

Run:

```bash
npm test -- tests/ui/app-supabase-auth-shell.test.mjs
```

Expected: fails because `src/ui/app.js` still uses demo role buttons.

- [ ] **Step 3: Replace demo login with Supabase email/password login**

Modify `src/ui/app.js` so the top imports are:

```js
import { createMissingSupabaseConfigMessage } from '../integrations/supabase/config.js';
import { createSupabaseBrowserClient } from '../integrations/supabase/client.js';
import { createSupabaseBidStore } from '../app/supabase-bid-store.js';
import { renderDashboard } from './render.js';
```

Replace the in-memory bootstrap state with:

```js
export async function bootBidPlatformApp(root) {
  const now = () => new Date().toISOString();
  const { client, config } = await createSupabaseBrowserClient();
  let store = client ? createSupabaseBidStore({ supabase: client }) : null;
  let session = { status: 'signed_out' };
  let state = null;
  let selectedNoticeId = null;
  let selectedFile = null;
  let message = config.configured ? '이메일과 비밀번호로 로그인하세요.' : createMissingSupabaseConfigMessage();
```

Render a login form:

```js
  function renderLogin() {
    return `
      <section class="login-screen">
        <header class="topbar">
          <div class="login-copy">
            <p class="eyebrow">국내용 입찰 시스템</p>
            <h1>입찰 시스템 로그인</h1>
          </div>
          <span class="role-pill">Supabase</span>
        </header>
        <form class="login-form" data-form="login">
          <label>이메일<input name="email" type="email" autocomplete="email" required></label>
          <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
          <button data-action="login" type="submit" ${store ? '' : 'disabled'}>로그인</button>
        </form>
      </section>
    `;
  }
```

Add async session refresh:

```js
  async function refreshSession() {
    if (!store) {
      session = { status: 'signed_out' };
      state = null;
      render();
      return;
    }
    session = await store.loadSession();
    if (session.status === 'signed_in') {
      state = await store.loadDashboard(session.member);
      if (!selectedNoticeId) selectedNoticeId = state.notices[0]?.id || null;
    } else {
      state = null;
      selectedNoticeId = null;
    }
    render();
  }
```

Keep existing event wiring patterns, but route actions through `store.signIn`, `store.signOut`, `store.createOperatorNotice`, `store.submitProposalFile`, `store.evaluateSubmission`, `store.selectPreferredProposal`, and `store.markResultNotificationComplete`. After each successful write, call `await refreshSession()`.

- [ ] **Step 4: Verify auth shell source test passes**

Run:

```bash
npm test -- tests/ui/app-supabase-auth-shell.test.mjs
```

Expected: pass.

- [ ] **Step 5: Run existing UI source tests**

Run:

```bash
npm test -- tests/ui/app-login-shell.test.mjs tests/ui/korean-localization.test.mjs tests/ui/app-copy-fallback.test.mjs tests/ui/app-evaluation-input.test.mjs
```

Expected: tests that still assert demo role buttons fail. Update those tests to assert email/password login and Korean Supabase messages instead of demo role buttons.

- [ ] **Step 6: Update old app shell tests**

Modify `tests/ui/app-login-shell.test.mjs` so it asserts:

```js
assert.match(appSource, /입찰 시스템 로그인/);
assert.match(appSource, /name="email"/);
assert.match(appSource, /name="password"/);
assert.match(appSource, /data-action="login"/);
assert.match(appSource, /data-action="logout"/);
assert.doesNotMatch(appSource, /data-login-role/);
assert.doesNotMatch(appSource, /role-switcher/);
```

Modify `tests/ui/korean-localization.test.mjs` to keep the Korean workflow assertions and replace demo role checks with:

```js
assert.match(appSource, /이메일과 비밀번호로 로그인하세요/);
assert.match(appSource, /Supabase 환경변수/);
```

- [ ] **Step 7: Verify UI shell tests pass**

Run:

```bash
npm test -- tests/ui/app-supabase-auth-shell.test.mjs tests/ui/app-login-shell.test.mjs tests/ui/korean-localization.test.mjs tests/ui/app-copy-fallback.test.mjs tests/ui/app-evaluation-input.test.mjs
```

Expected: pass.

- [ ] **Step 8: Commit UI auth wiring**

Run:

```bash
git add src/ui/app.js tests/ui/app-supabase-auth-shell.test.mjs tests/ui/app-login-shell.test.mjs tests/ui/korean-localization.test.mjs
git commit -m "feat: wire supabase auth login shell"
```

Expected: commit succeeds, unless the sandbox blocks git index writes.

---

### Task 7: Render-State Compatibility for Supabase Data

**Files:**
- Modify: `src/ui/render.js`
- Modify: `tests/ui/render.test.mjs`

- [ ] **Step 1: Write failing render tests for Supabase-shaped state**

Add to `tests/ui/render.test.mjs`:

```js
test('participant dashboard remains safe with Supabase participant-safe proposal rows', () => {
  const state = {
    members: [{
      id: 'supplier-user',
      name: '참여자',
      role: 'Supplier',
      companyId: 'company-supplier-user',
      companyName: '서울공급웍스',
    }],
    companies: [{ id: 'company-supplier-user', name: '서울공급웍스', type: 'Supplier', status: 'Approved' }],
    notices: [{
      id: 'notice-1',
      title: '네트워크 고도화',
      category: '정보기술',
      summary: '요약',
      startsAt: '2026-06-22T09:00:00.000Z',
      deadlineAt: '2026-07-05T09:00:00.000Z',
      status: 'Published',
      requestFile: { name: '요청서.pdf', size: 1024, url: 'https://signed.example/rfp' },
    }],
    proposals: [{
      id: 'proposal-1',
      bidNoticeId: 'notice-1',
      supplierCompanyId: 'company-supplier-user',
      submittedByMemberId: 'supplier-user',
      file: { name: '제안서.pdf', size: 2048, url: '' },
      status: 'Submitted',
      submittedAt: '2026-06-24T09:00:00.000Z',
    }],
    evaluations: [],
  };

  const html = renderDashboard({
    state,
    memberId: 'supplier-user',
    selectedNoticeId: 'notice-1',
    now: '2026-06-25T09:00:00.000Z',
  });

  assert.match(html, /제출 완료/);
  assert.match(html, /요청서\.pdf/);
  assert.doesNotMatch(html, /평가 점수|평가 메모|우선대상자|탈락자|제안서 다운로드/);
});
```

- [ ] **Step 2: Run the render test**

Run:

```bash
npm test -- tests/ui/render.test.mjs
```

Expected: if it fails, it should fail because `companyName` lookup assumes every member has a company row or because participant proposal file links are not safe enough.

- [ ] **Step 3: Make render helpers tolerant of Supabase-mapped state**

Modify `companyName` in `src/ui/render.js`:

```js
function companyName(state, companyId, member = null) {
  return state.companies.find((company) => company.id === companyId)?.name || member?.companyName || '플랫폼';
}
```

Modify `renderHeader` to call:

```js
<p class="eyebrow">${escapeHtml(companyName(state, member.companyId, member))}</p>
```

Ensure participant submitted file display remains plain text and does not use `proposal.file.url`.

- [ ] **Step 4: Verify render tests pass**

Run:

```bash
npm test -- tests/ui/render.test.mjs
```

Expected: pass.

- [ ] **Step 5: Commit render compatibility changes**

Run:

```bash
git add src/ui/render.js tests/ui/render.test.mjs
git commit -m "fix: keep render state safe for supabase data"
```

Expected: commit succeeds, unless the sandbox blocks git index writes.

---

### Task 8: End-to-End Local Verification and Deployment Notes

**Files:**
- Modify: `docs/superpowers/specs/2026-06-24-supabase-vercel-integration-design.md`
- Create: `docs/deployment/supabase-vercel.md`

- [ ] **Step 1: Write deployment runbook**

Create `docs/deployment/supabase-vercel.md`:

````md
# Supabase and Vercel Deployment

## Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/migrations/001_bid_platform.sql`.
3. Confirm Storage buckets `rfp-files` and `proposal-files` exist and are private.
4. Create operator and supplier users in Supabase Auth.
5. Insert matching profile rows:

```sql
insert into public.profiles (id, email, name, company_name, role)
values
  ('OPERATOR_AUTH_USER_ID', 'operator@example.com', '운영자', '플랫폼', 'operator'),
  ('SUPPLIER_AUTH_USER_ID', 'supplier@example.com', '입찰참여자', '서울공급웍스', 'supplier');
```

## Local App

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL`.
3. Set `VITE_SUPABASE_ANON_KEY`.
4. Run `npm install`.
5. Run `npm run dev`.

## Vercel

1. Import the repository into Vercel.
2. Set Framework Preset to Vite.
3. Set Build Command to `npm run build`.
4. Set Output Directory to `dist`.
5. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. Deploy.

## Manual Acceptance

1. Login as operator.
2. Create a notice with an RFP file.
3. Copy the Outlook invitation template.
4. Login as supplier.
5. Download the RFP.
6. Upload a proposal file before the deadline.
7. Login as operator after the deadline.
8. Download the proposal file.
9. Save scores and notes for every proposal.
10. Select one preferred proposal.
11. Copy preferred/rejected Outlook result templates.
12. Click notification complete.
13. Login as supplier and confirm no score, note, preferred/rejected status, or proposal download link is visible.
````

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: all Node tests pass.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check src/ui/app.js
node --check src/ui/render.js
node --check src/app/supabase-bid-store.js
node --check src/app/supabase-mappers.js
node --check src/app/supabase-storage-paths.js
node --check src/integrations/supabase/config.js
node --check src/integrations/supabase/client.js
```

Expected: all syntax checks exit 0.

- [ ] **Step 4: Run build when dependencies are installed**

Run:

```bash
npm run build
```

Expected with installed dependencies: Vite builds into `dist`. If the current environment cannot install `vite` or `@supabase/supabase-js`, record that build verification is blocked by missing package installation and include the exact error.

- [ ] **Step 5: Commit deployment docs**

Run:

```bash
git add docs/deployment/supabase-vercel.md docs/superpowers/specs/2026-06-24-supabase-vercel-integration-design.md
git commit -m "docs: add supabase vercel deployment runbook"
```

Expected: commit succeeds, unless the sandbox blocks git index writes.

---

## Self-Review Checklist

- Spec coverage:
  - Vercel deployment: Task 1 and Task 8.
  - Supabase Auth: Task 3, Task 5, Task 6.
  - Supabase DB and RLS: Task 2.
  - Supabase Storage: Task 2, Task 4, Task 5.
  - Participant/operator separation: Task 2, Task 5, Task 6, Task 7.
  - Outlook remains manual: Task 6 keeps template-copy UI and Task 8 acceptance steps verify manual Outlook flow.
- Placeholder scan: no unfinished-marker text or unspecified implementation steps.
- Type consistency:
  - Supabase roles map from `supplier`/`operator` to existing `Supplier`/`Operator`.
  - Supabase notices map from `starts_at`/`deadline_at` to existing `startsAt`/`deadlineAt`.
  - Supabase proposal rows map from `notice_id`/`supplier_id` to existing `bidNoticeId`/`submittedByMemberId`.
