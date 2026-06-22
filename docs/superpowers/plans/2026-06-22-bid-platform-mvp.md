# Bid Platform MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working bid platform MVP where buyers publish bid notices, suppliers submit proposals, buyers evaluate and award proposals, and operators moderate companies and notices.

**Architecture:** Build a single static web application using browser ES modules, with domain rules kept in focused modules under `src/domain/` and UI rendering under `src/ui/`. The app uses an in-memory store seeded with sample data for the MVP, while domain services are pure functions tested with Node's built-in test runner.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, Node.js `node:test`, Node.js `assert/strict`, no external runtime dependencies.

---

## File Structure

- `package.json`: project metadata and `npm test` command using Node's built-in test runner.
- `index.html`: static application shell.
- `src/main.js`: browser entrypoint.
- `src/styles.css`: responsive operational UI styling.
- `src/domain/constants.js`: roles, statuses, and activity action names.
- `src/domain/model.js`: entity factory helpers for members, companies, notices, proposals, evaluations, reports, and activity logs.
- `src/domain/errors.js`: shared `DomainError` class and assertion helpers.
- `src/domain/bid-notices.js`: notice publication and notice state transitions.
- `src/domain/permissions.js`: role, company, ownership, and suspension checks.
- `src/domain/proposals.js`: discovery, proposal submission, proposal update, proposal withdrawal, and deadline rules.
- `src/domain/awards.js`: evaluation score calculation and winner selection.
- `src/domain/moderation.js`: company approval, company suspension, notice hiding, notice restoration, and report resolution.
- `src/app/seed-data.js`: realistic demo companies, members, notices, saved notices, proposals, reports, and activity.
- `src/app/platform-store.js`: in-memory application store that composes domain modules into buyer, supplier, and operator actions.
- `src/ui/render.js`: pure HTML render functions for buyer, supplier, and operator screens.
- `src/ui/app.js`: browser event wiring and state updates.
- `tests/project-structure.test.mjs`: verifies project shell files.
- `tests/domain/model.test.mjs`: verifies entity defaults.
- `tests/domain/bid-notices.test.mjs`: verifies notice state transitions.
- `tests/domain/permissions.test.mjs`: verifies access control.
- `tests/domain/proposals.test.mjs`: verifies proposal rules and deadline behavior.
- `tests/domain/awards.test.mjs`: verifies scoring and awarding.
- `tests/domain/moderation.test.mjs`: verifies operator actions.
- `tests/app/platform-store.test.mjs`: verifies end-to-end store workflow.
- `tests/ui/render.test.mjs`: verifies role-aware UI rendering.

## Task 1: Project Shell and Test Runner

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/styles.css`
- Test: `tests/project-structure.test.mjs`

- [ ] **Step 1: Write the failing project structure test**

```javascript
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('project declares module mode and a node test command', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.test, 'node --test tests/**/*.test.mjs');
});

test('index shell exposes an app root and module entrypoint', async () => {
  const html = await readFile('index.html', 'utf8');

  assert.match(html, /id="app"/);
  assert.match(html, /src="\.\/src\/main\.js"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/project-structure.test.mjs`

Expected: FAIL because `package.json` and `index.html` do not exist yet.

- [ ] **Step 3: Create the minimal project shell**

Create `package.json`:

```json
{
  "name": "bid-platform-mvp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/**/*.test.mjs"
  }
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Bid Platform MVP</title>
    <link rel="stylesheet" href="./src/styles.css">
  </head>
  <body>
    <main id="app" class="app-shell">
      <p>Loading bid platform...</p>
    </main>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

Create `src/main.js`:

```javascript
const app = document.querySelector('#app');

app.innerHTML = `
  <section class="empty-state">
    <h1>Bid Platform MVP</h1>
    <p>The platform shell is ready.</p>
  </section>
`;
```

Create `src/styles.css`:

```css
:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --panel: #ffffff;
  --ink: #17202a;
  --muted: #5f6b7a;
  --line: #d9dee7;
  --accent: #0f766e;
  --accent-strong: #115e59;
  --danger: #b42318;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.app-shell {
  min-height: 100vh;
}

.empty-state {
  max-width: 720px;
  margin: 0 auto;
  padding: 72px 24px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS with 2 project structure tests passing.

- [ ] **Step 5: Commit**

```bash
git add package.json index.html src/main.js src/styles.css tests/project-structure.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "chore: scaffold bid platform shell"
```

## Task 2: Domain Constants, Errors, and Entity Factories

**Files:**
- Create: `src/domain/constants.js`
- Create: `src/domain/errors.js`
- Create: `src/domain/model.js`
- Test: `tests/domain/model.test.mjs`

- [ ] **Step 1: Write the failing entity model test**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createProposal } from '../../src/domain/model.js';

test('company, member, notice, and proposal factories set required defaults', () => {
  const buyerCompany = createCompany({
    id: 'company-buyer',
    name: 'Acme Buyer',
    businessRegistrationNumber: '100-00-00001',
    type: CompanyType.Buyer,
    contactName: 'Buyer Manager',
    contactEmail: 'buyer@example.com',
  });

  const buyer = createMember({
    id: 'member-buyer',
    name: 'Buyer Manager',
    email: 'buyer@example.com',
    role: MemberRole.Buyer,
    companyId: buyerCompany.id,
  });

  const notice = createBidNotice({
    id: 'notice-1',
    buyerCompanyId: buyerCompany.id,
    title: 'Warehouse Renovation',
    category: 'Construction',
    requirements: 'Repair loading dock and floor.',
    deadlineAt: '2026-07-15T09:00:00.000Z',
    evaluationCriteria: 'Price 40, technical 40, schedule 20',
    createdByMemberId: buyer.id,
  });

  const proposal = createProposal({
    id: 'proposal-1',
    bidNoticeId: notice.id,
    supplierCompanyId: 'company-supplier',
    price: 12000000,
    deliverySchedule: '30 days',
    proposalText: 'We can complete the work in July.',
  });

  assert.equal(buyerCompany.status, CompanyStatus.Pending);
  assert.equal(buyer.status, 'Active');
  assert.equal(notice.status, NoticeStatus.Draft);
  assert.equal(proposal.status, ProposalStatus.Draft);
  assert.deepEqual(notice.attachmentRequirements, []);
  assert.deepEqual(proposal.attachmentIds, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/domain/model.test.mjs`

Expected: FAIL with module-not-found errors for `src/domain/constants.js` and `src/domain/model.js`.

- [ ] **Step 3: Create constants, domain error helpers, and entity factories**

Create `src/domain/constants.js`:

```javascript
export const MemberRole = Object.freeze({
  Buyer: 'Buyer',
  Supplier: 'Supplier',
  Operator: 'Operator',
});

export const MemberStatus = Object.freeze({
  Active: 'Active',
  Suspended: 'Suspended',
});

export const CompanyType = Object.freeze({
  Buyer: 'Buyer',
  Supplier: 'Supplier',
});

export const CompanyStatus = Object.freeze({
  Pending: 'Pending',
  Approved: 'Approved',
  Suspended: 'Suspended',
});

export const NoticeStatus = Object.freeze({
  Draft: 'Draft',
  Published: 'Published',
  Closed: 'Closed',
  Evaluating: 'Evaluating',
  Awarded: 'Awarded',
  Ended: 'Ended',
  Hidden: 'Hidden',
});

export const ProposalStatus = Object.freeze({
  Draft: 'Draft',
  Submitted: 'Submitted',
  Withdrawn: 'Withdrawn',
  Selected: 'Selected',
  NotSelected: 'NotSelected',
});

export const ReportStatus = Object.freeze({
  Open: 'Open',
  Resolved: 'Resolved',
  Dismissed: 'Dismissed',
});

export const ActivityAction = Object.freeze({
  CompanyApproved: 'CompanyApproved',
  CompanySuspended: 'CompanySuspended',
  NoticePublished: 'NoticePublished',
  NoticeClosed: 'NoticeClosed',
  NoticeHidden: 'NoticeHidden',
  NoticeRestored: 'NoticeRestored',
  NoticeAwarded: 'NoticeAwarded',
  ProposalSubmitted: 'ProposalSubmitted',
  ProposalUpdated: 'ProposalUpdated',
  ProposalWithdrawn: 'ProposalWithdrawn',
  ReportResolved: 'ReportResolved',
});
```

Create `src/domain/errors.js`:

```javascript
export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function assertRule(condition, code, message) {
  if (!condition) {
    throw new DomainError(code, message);
  }
}
```

Create `src/domain/model.js`:

```javascript
import { CompanyStatus, MemberStatus, NoticeStatus, ProposalStatus, ReportStatus } from './constants.js';

export function createCompany(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    businessRegistrationNumber: input.businessRegistrationNumber,
    type: input.type,
    status: input.status || CompanyStatus.Pending,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createMember(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    role: input.role,
    companyId: input.companyId || null,
    status: input.status || MemberStatus.Active,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createBidNotice(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    buyerCompanyId: input.buyerCompanyId,
    title: input.title,
    category: input.category,
    summary: input.summary || '',
    requirements: input.requirements,
    budgetMin: input.budgetMin || null,
    budgetMax: input.budgetMax || null,
    deadlineAt: input.deadlineAt,
    evaluationCriteria: input.evaluationCriteria,
    attachmentRequirements: input.attachmentRequirements || [],
    status: input.status || NoticeStatus.Draft,
    createdByMemberId: input.createdByMemberId,
    awardedProposalId: input.awardedProposalId || null,
    awardReason: input.awardReason || '',
    createdAt: now,
    updatedAt: input.updatedAt || now,
    publishedAt: input.publishedAt || null,
    closedAt: input.closedAt || null,
    awardedAt: input.awardedAt || null,
  };
}

export function createProposal(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    bidNoticeId: input.bidNoticeId,
    supplierCompanyId: input.supplierCompanyId,
    price: input.price,
    deliverySchedule: input.deliverySchedule,
    proposalText: input.proposalText,
    attachmentIds: input.attachmentIds || [],
    status: input.status || ProposalStatus.Draft,
    submittedAt: input.submittedAt || null,
    withdrawnAt: input.withdrawnAt || null,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createEvaluation(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    bidNoticeId: input.bidNoticeId,
    proposalId: input.proposalId,
    evaluatorMemberId: input.evaluatorMemberId,
    priceScore: input.priceScore,
    technicalScore: input.technicalScore,
    scheduleScore: input.scheduleScore,
    note: input.note || '',
    totalScore: input.totalScore,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createActivityLog(input) {
  return {
    id: input.id,
    actorMemberId: input.actorMemberId,
    actorCompanyId: input.actorCompanyId || null,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    metadata: input.metadata || {},
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function createReport(input) {
  const now = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    reporterMemberId: input.reporterMemberId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    status: input.status || ReportStatus.Open,
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}
```

- [ ] **Step 4: Run the model test to verify it passes**

Run: `node --test tests/domain/model.test.mjs`

Expected: PASS with 1 model test passing.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS with project structure and model tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/domain/constants.js src/domain/errors.js src/domain/model.js tests/domain/model.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add bid platform domain entities"
```

## Task 3: Bid Notice State Transitions

**Files:**
- Create: `src/domain/bid-notices.js`
- Test: `tests/domain/bid-notices.test.mjs`

- [ ] **Step 1: Write failing tests for publication and state transitions**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember } from '../../src/domain/model.js';
import { closeNotice, publishNotice, startEvaluation, transitionNotice } from '../../src/domain/bid-notices.js';

const now = '2026-06-22T00:00:00.000Z';

function buyerFixture() {
  const company = createCompany({
    id: 'buyer-co',
    name: 'Buyer Co',
    businessRegistrationNumber: '100-00-00001',
    type: CompanyType.Buyer,
    status: CompanyStatus.Approved,
    contactName: 'Buyer',
    contactEmail: 'buyer@example.com',
  });
  const member = createMember({
    id: 'buyer-1',
    name: 'Buyer',
    email: 'buyer@example.com',
    role: MemberRole.Buyer,
    companyId: company.id,
  });
  const notice = createBidNotice({
    id: 'notice-1',
    buyerCompanyId: company.id,
    title: 'Office Cleaning',
    category: 'Facility',
    requirements: 'Daily cleaning for HQ.',
    deadlineAt: '2026-07-01T00:00:00.000Z',
    evaluationCriteria: 'Price 50, service 50',
    createdByMemberId: member.id,
  });
  return { company, member, notice };
}

test('buyer publishes a complete draft notice', () => {
  const { company, member, notice } = buyerFixture();

  const published = publishNotice({ notice, actor: member, buyerCompany: company, now });

  assert.equal(published.status, NoticeStatus.Published);
  assert.equal(published.publishedAt, now);
});

test('publishing rejects incomplete notices', () => {
  const { company, member, notice } = buyerFixture();
  const incomplete = { ...notice, title: '' };

  assert.throws(
    () => publishNotice({ notice: incomplete, actor: member, buyerCompany: company, now }),
    /title, category, requirements, deadline, and evaluation criteria/
  );
});

test('notice transitions follow the allowed sequence', () => {
  const { notice } = buyerFixture();
  const published = { ...notice, status: NoticeStatus.Published };
  const closed = closeNotice({ notice: published, now });
  const evaluating = startEvaluation({ notice: closed, now });

  assert.equal(closed.status, NoticeStatus.Closed);
  assert.equal(evaluating.status, NoticeStatus.Evaluating);
  assert.throws(() => transitionNotice(notice, NoticeStatus.Awarded, now), /not allowed/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/domain/bid-notices.test.mjs`

Expected: FAIL with module-not-found for `src/domain/bid-notices.js`.

- [ ] **Step 3: Implement notice publication and transitions**

```javascript
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from './constants.js';
import { assertRule } from './errors.js';

const allowedTransitions = new Map([
  [NoticeStatus.Draft, new Set([NoticeStatus.Published])],
  [NoticeStatus.Published, new Set([NoticeStatus.Closed, NoticeStatus.Hidden])],
  [NoticeStatus.Hidden, new Set([NoticeStatus.Published])],
  [NoticeStatus.Closed, new Set([NoticeStatus.Evaluating])],
  [NoticeStatus.Evaluating, new Set([NoticeStatus.Awarded])],
  [NoticeStatus.Awarded, new Set([NoticeStatus.Ended])],
]);

export function transitionNotice(notice, nextStatus, now = new Date().toISOString()) {
  const allowed = allowedTransitions.get(notice.status) || new Set();
  assertRule(
    allowed.has(nextStatus),
    'NOTICE_TRANSITION_BLOCKED',
    `Transition from ${notice.status} to ${nextStatus} is not allowed.`
  );

  return {
    ...notice,
    status: nextStatus,
    updatedAt: now,
    publishedAt: nextStatus === NoticeStatus.Published ? now : notice.publishedAt,
    closedAt: nextStatus === NoticeStatus.Closed ? now : notice.closedAt,
    awardedAt: nextStatus === NoticeStatus.Awarded ? now : notice.awardedAt,
  };
}

export function publishNotice({ notice, actor, buyerCompany, now = new Date().toISOString() }) {
  assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_PUBLISH', 'Only buyers can publish notices.');
  assertRule(actor.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', 'Buyers can publish only their own company notices.');
  assertRule(buyerCompany.type === CompanyType.Buyer, 'BUYER_COMPANY_REQUIRED', 'Only buyer companies can publish notices.');
  assertRule(buyerCompany.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', 'Buyer company must be approved before publishing.');
  assertRule(
    Boolean(notice.title && notice.category && notice.requirements && notice.deadlineAt && notice.evaluationCriteria),
    'NOTICE_INCOMPLETE',
    'A notice cannot be published without a title, category, requirements, deadline, and evaluation criteria.'
  );
  assertRule(new Date(notice.deadlineAt).getTime() > new Date(now).getTime(), 'DEADLINE_PAST', 'Deadline must be in the future.');

  return transitionNotice(notice, NoticeStatus.Published, now);
}

export function closeNotice({ notice, now = new Date().toISOString() }) {
  return transitionNotice(notice, NoticeStatus.Closed, now);
}

export function startEvaluation({ notice, now = new Date().toISOString() }) {
  return transitionNotice(notice, NoticeStatus.Evaluating, now);
}
```

- [ ] **Step 4: Run the bid notice tests**

Run: `node --test tests/domain/bid-notices.test.mjs`

Expected: PASS with 3 bid notice tests passing.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/bid-notices.js tests/domain/bid-notices.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add bid notice state rules"
```

## Task 4: Role and Ownership Permissions

**Files:**
- Create: `src/domain/permissions.js`
- Test: `tests/domain/permissions.test.mjs`

- [ ] **Step 1: Write failing permission tests**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createProposal } from '../../src/domain/model.js';
import { canManageNotice, canSubmitProposal, canViewProposal, ensureActiveCompany } from '../../src/domain/permissions.js';

const buyerCompany = createCompany({
  id: 'buyer-co',
  name: 'Buyer Co',
  businessRegistrationNumber: '100',
  type: CompanyType.Buyer,
  status: CompanyStatus.Approved,
  contactName: 'Buyer',
  contactEmail: 'buyer@example.com',
});
const supplierCompany = createCompany({
  id: 'supplier-co',
  name: 'Supplier Co',
  businessRegistrationNumber: '200',
  type: CompanyType.Supplier,
  status: CompanyStatus.Approved,
  contactName: 'Supplier',
  contactEmail: 'supplier@example.com',
});
const buyer = createMember({ id: 'buyer', name: 'Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: buyerCompany.id });
const supplier = createMember({ id: 'supplier', name: 'Supplier', email: 'supplier@example.com', role: MemberRole.Supplier, companyId: supplierCompany.id });
const notice = createBidNotice({
  id: 'notice',
  buyerCompanyId: buyerCompany.id,
  title: 'Bid',
  category: 'IT',
  requirements: 'Build system.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  evaluationCriteria: 'Price 50, technical 50',
  createdByMemberId: buyer.id,
  status: NoticeStatus.Published,
});
const proposal = createProposal({
  id: 'proposal',
  bidNoticeId: notice.id,
  supplierCompanyId: supplierCompany.id,
  price: 1000,
  deliverySchedule: '10 days',
  proposalText: 'Proposal',
});

test('buyers manage only their company notices', () => {
  assert.equal(canManageNotice(buyer, notice), true);
  assert.equal(canManageNotice({ ...buyer, companyId: 'other-co' }, notice), false);
});

test('suppliers submit only to published notices from other companies', () => {
  assert.equal(canSubmitProposal({ actor: supplier, supplierCompany, notice, now: '2026-06-22T00:00:00.000Z' }), true);
  assert.equal(canSubmitProposal({ actor: supplier, supplierCompany, notice: { ...notice, buyerCompanyId: supplierCompany.id }, now: '2026-06-22T00:00:00.000Z' }), false);
});

test('proposal visibility is limited to owning supplier, owning buyer, and operator', () => {
  const operator = createMember({ id: 'operator', name: 'Operator', email: 'ops@example.com', role: MemberRole.Operator });

  assert.equal(canViewProposal({ actor: supplier, notice, proposal }), true);
  assert.equal(canViewProposal({ actor: buyer, notice, proposal }), true);
  assert.equal(canViewProposal({ actor: operator, notice, proposal }), true);
  assert.equal(canViewProposal({ actor: { ...supplier, companyId: 'other-supplier' }, notice, proposal }), false);
});

test('suspended companies are rejected for transactional actions', () => {
  assert.throws(() => ensureActiveCompany({ ...supplierCompany, status: CompanyStatus.Suspended }), /suspended/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/domain/permissions.test.mjs`

Expected: FAIL with module-not-found for `src/domain/permissions.js`.

- [ ] **Step 3: Implement permission helpers**

```javascript
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from './constants.js';
import { assertRule } from './errors.js';

export function ensureActiveCompany(company) {
  assertRule(company.status !== CompanyStatus.Suspended, 'COMPANY_SUSPENDED', 'Suspended companies cannot take new transactional actions.');
  assertRule(company.status === CompanyStatus.Approved, 'COMPANY_NOT_APPROVED', 'Company must be approved before taking this action.');
  return true;
}

export function canManageNotice(actor, notice) {
  return actor.role === MemberRole.Buyer && actor.companyId === notice.buyerCompanyId;
}

export function canSubmitProposal({ actor, supplierCompany, notice, now }) {
  if (actor.role !== MemberRole.Supplier) return false;
  if (supplierCompany.type !== CompanyType.Supplier) return false;
  if (supplierCompany.status !== CompanyStatus.Approved) return false;
  if (actor.companyId !== supplierCompany.id) return false;
  if (notice.status !== NoticeStatus.Published) return false;
  if (notice.buyerCompanyId === supplierCompany.id) return false;
  return new Date(now).getTime() < new Date(notice.deadlineAt).getTime();
}

export function canViewProposal({ actor, notice, proposal }) {
  if (actor.role === MemberRole.Operator) return true;
  if (actor.role === MemberRole.Buyer) return actor.companyId === notice.buyerCompanyId;
  if (actor.role === MemberRole.Supplier) return actor.companyId === proposal.supplierCompanyId;
  return false;
}
```

- [ ] **Step 4: Run permission tests**

Run: `node --test tests/domain/permissions.test.mjs`

Expected: PASS with 4 permission tests passing.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/permissions.js tests/domain/permissions.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add role and ownership permissions"
```

## Task 5: Proposal Discovery and Submission Rules

**Files:**
- Create: `src/domain/proposals.js`
- Test: `tests/domain/proposals.test.mjs`

- [ ] **Step 1: Write failing proposal lifecycle tests**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createProposal } from '../../src/domain/model.js';
import { discoverNotices, submitProposal, updateProposal, withdrawProposal } from '../../src/domain/proposals.js';

const now = '2026-06-22T00:00:00.000Z';
const buyerCompany = createCompany({ id: 'buyer-co', name: 'Buyer Co', businessRegistrationNumber: '100', type: CompanyType.Buyer, status: CompanyStatus.Approved, contactName: 'Buyer', contactEmail: 'buyer@example.com' });
const supplierCompany = createCompany({ id: 'supplier-co', name: 'Supplier Co', businessRegistrationNumber: '200', type: CompanyType.Supplier, status: CompanyStatus.Approved, contactName: 'Supplier', contactEmail: 'supplier@example.com' });
const supplier = createMember({ id: 'supplier', name: 'Supplier', email: 'supplier@example.com', role: MemberRole.Supplier, companyId: supplierCompany.id });
const publishedNotice = createBidNotice({
  id: 'notice',
  buyerCompanyId: buyerCompany.id,
  title: 'ERP Build',
  category: 'IT',
  requirements: 'Build ERP MVP.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  evaluationCriteria: 'Price 40, technical 40, schedule 20',
  createdByMemberId: 'buyer',
  status: NoticeStatus.Published,
});

test('suppliers discover published notices and not hidden notices', () => {
  const hiddenNotice = { ...publishedNotice, id: 'hidden', status: NoticeStatus.Hidden };

  const result = discoverNotices([publishedNotice, hiddenNotice]);

  assert.deepEqual(result.map((notice) => notice.id), ['notice']);
});

test('supplier submits one active proposal before the deadline', () => {
  const proposal = submitProposal({
    actor: supplier,
    supplierCompany,
    notice: publishedNotice,
    existingProposals: [],
    input: { id: 'proposal', price: 5000000, deliverySchedule: '45 days', proposalText: 'We can deliver.' },
    now,
  });

  assert.equal(proposal.status, ProposalStatus.Submitted);
  assert.equal(proposal.submittedAt, now);
});

test('supplier cannot submit twice to the same notice', () => {
  const existing = createProposal({
    id: 'proposal-existing',
    bidNoticeId: publishedNotice.id,
    supplierCompanyId: supplierCompany.id,
    price: 5000000,
    deliverySchedule: '45 days',
    proposalText: 'Existing proposal',
    status: ProposalStatus.Submitted,
  });

  assert.throws(
    () => submitProposal({ actor: supplier, supplierCompany, notice: publishedNotice, existingProposals: [existing], input: { id: 'proposal-new', price: 5100000, deliverySchedule: '40 days', proposalText: 'New proposal' }, now }),
    /one active proposal/
  );
});

test('supplier updates and withdraws own proposal before deadline only', () => {
  const submitted = createProposal({
    id: 'proposal',
    bidNoticeId: publishedNotice.id,
    supplierCompanyId: supplierCompany.id,
    price: 5000000,
    deliverySchedule: '45 days',
    proposalText: 'Original',
    status: ProposalStatus.Submitted,
  });

  const updated = updateProposal({ actor: supplier, notice: publishedNotice, proposal: submitted, input: { price: 4900000, proposalText: 'Updated' }, now });
  const withdrawn = withdrawProposal({ actor: supplier, notice: publishedNotice, proposal: updated, now });

  assert.equal(updated.price, 4900000);
  assert.equal(withdrawn.status, ProposalStatus.Withdrawn);
  assert.throws(() => updateProposal({ actor: supplier, notice: publishedNotice, proposal: submitted, input: { price: 4800000 }, now: '2026-07-02T00:00:00.000Z' }), /after the deadline/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/domain/proposals.test.mjs`

Expected: FAIL with module-not-found for `src/domain/proposals.js`.

- [ ] **Step 3: Implement discovery and proposal lifecycle rules**

```javascript
import { NoticeStatus, ProposalStatus } from './constants.js';
import { assertRule } from './errors.js';
import { createProposal } from './model.js';
import { canSubmitProposal } from './permissions.js';

function beforeDeadline(notice, now) {
  return new Date(now).getTime() < new Date(notice.deadlineAt).getTime();
}

export function discoverNotices(notices) {
  return notices.filter((notice) => notice.status === NoticeStatus.Published);
}

export function submitProposal({ actor, supplierCompany, notice, existingProposals, input, now = new Date().toISOString() }) {
  assertRule(
    canSubmitProposal({ actor, supplierCompany, notice, now }),
    'PROPOSAL_SUBMISSION_BLOCKED',
    'Supplier can submit proposals only to published notices before the deadline.'
  );

  const hasActiveProposal = existingProposals.some(
    (proposal) =>
      proposal.bidNoticeId === notice.id &&
      proposal.supplierCompanyId === supplierCompany.id &&
      proposal.status !== ProposalStatus.Withdrawn
  );
  assertRule(!hasActiveProposal, 'ACTIVE_PROPOSAL_EXISTS', 'A supplier cannot submit more than one active proposal to the same notice.');

  return createProposal({
    id: input.id,
    bidNoticeId: notice.id,
    supplierCompanyId: supplierCompany.id,
    price: input.price,
    deliverySchedule: input.deliverySchedule,
    proposalText: input.proposalText,
    attachmentIds: input.attachmentIds || [],
    status: ProposalStatus.Submitted,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateProposal({ actor, notice, proposal, input, now = new Date().toISOString() }) {
  assertRule(actor.companyId === proposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', 'Suppliers can update only their own proposals.');
  assertRule(proposal.status === ProposalStatus.Submitted, 'PROPOSAL_NOT_SUBMITTED', 'Only submitted proposals can be updated.');
  assertRule(beforeDeadline(notice, now), 'DEADLINE_PASSED', 'A supplier cannot update a proposal after the deadline.');

  return {
    ...proposal,
    price: input.price || proposal.price,
    deliverySchedule: input.deliverySchedule || proposal.deliverySchedule,
    proposalText: input.proposalText || proposal.proposalText,
    attachmentIds: input.attachmentIds || proposal.attachmentIds,
    updatedAt: now,
  };
}

export function withdrawProposal({ actor, notice, proposal, now = new Date().toISOString() }) {
  assertRule(actor.companyId === proposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', 'Suppliers can withdraw only their own proposals.');
  assertRule(proposal.status === ProposalStatus.Submitted, 'PROPOSAL_NOT_SUBMITTED', 'Only submitted proposals can be withdrawn.');
  assertRule(beforeDeadline(notice, now), 'DEADLINE_PASSED', 'A supplier cannot withdraw a proposal after the deadline.');

  return {
    ...proposal,
    status: ProposalStatus.Withdrawn,
    withdrawnAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run proposal tests**

Run: `node --test tests/domain/proposals.test.mjs`

Expected: PASS with 4 proposal tests passing.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/proposals.js tests/domain/proposals.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add proposal submission rules"
```

## Task 6: Evaluation and Award Selection

**Files:**
- Create: `src/domain/awards.js`
- Test: `tests/domain/awards.test.mjs`

- [ ] **Step 1: Write failing award tests**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemberRole, NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createBidNotice, createMember, createProposal } from '../../src/domain/model.js';
import { awardNotice, recordEvaluation } from '../../src/domain/awards.js';

const buyer = createMember({ id: 'buyer', name: 'Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: 'buyer-co' });
const notice = createBidNotice({
  id: 'notice',
  buyerCompanyId: 'buyer-co',
  title: 'ERP',
  category: 'IT',
  requirements: 'Build ERP.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  evaluationCriteria: 'Price 40, technical 40, schedule 20',
  createdByMemberId: buyer.id,
  status: NoticeStatus.Evaluating,
});
const proposalA = createProposal({ id: 'proposal-a', bidNoticeId: notice.id, supplierCompanyId: 'supplier-a', price: 100, deliverySchedule: '30 days', proposalText: 'A', status: ProposalStatus.Submitted });
const proposalB = createProposal({ id: 'proposal-b', bidNoticeId: notice.id, supplierCompanyId: 'supplier-b', price: 110, deliverySchedule: '25 days', proposalText: 'B', status: ProposalStatus.Submitted });

test('evaluation total is calculated from score fields', () => {
  const evaluation = recordEvaluation({
    id: 'eval-a',
    notice,
    proposal: proposalA,
    evaluator: buyer,
    priceScore: 35,
    technicalScore: 40,
    scheduleScore: 18,
    note: 'Strong proposal',
    now: '2026-07-02T00:00:00.000Z',
  });

  assert.equal(evaluation.totalScore, 93);
});

test('buyer awards exactly one submitted proposal and marks others not selected', () => {
  const result = awardNotice({
    notice,
    proposals: [proposalA, proposalB],
    selectedProposalId: proposalA.id,
    actor: buyer,
    awardReason: 'Best total score and delivery confidence.',
    now: '2026-07-02T00:00:00.000Z',
  });

  assert.equal(result.notice.status, NoticeStatus.Awarded);
  assert.equal(result.notice.awardedProposalId, proposalA.id);
  assert.equal(result.proposals.find((proposal) => proposal.id === proposalA.id).status, ProposalStatus.Selected);
  assert.equal(result.proposals.find((proposal) => proposal.id === proposalB.id).status, ProposalStatus.NotSelected);
});

test('notice with no submitted proposals cannot be awarded', () => {
  assert.throws(
    () => awardNotice({ notice, proposals: [], selectedProposalId: 'missing', actor: buyer, awardReason: 'No proposal', now: '2026-07-02T00:00:00.000Z' }),
    /at least one submitted proposal/
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/domain/awards.test.mjs`

Expected: FAIL with module-not-found for `src/domain/awards.js`.

- [ ] **Step 3: Implement evaluation and awarding**

```javascript
import { MemberRole, NoticeStatus, ProposalStatus } from './constants.js';
import { assertRule } from './errors.js';
import { createEvaluation } from './model.js';
import { transitionNotice } from './bid-notices.js';

function assertScore(score, label) {
  assertRule(Number.isFinite(score) && score >= 0 && score <= 100, 'INVALID_SCORE', `${label} score must be between 0 and 100.`);
}

export function recordEvaluation({ id, notice, proposal, evaluator, priceScore, technicalScore, scheduleScore, note, now = new Date().toISOString() }) {
  assertRule(evaluator.role === MemberRole.Buyer, 'ONLY_BUYERS_EVALUATE', 'Only buyers can evaluate proposals.');
  assertRule(evaluator.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', 'Buyers can evaluate only their own notices.');
  assertRule(proposal.bidNoticeId === notice.id, 'PROPOSAL_NOTICE_MISMATCH', 'Proposal must belong to the notice being evaluated.');
  assertScore(priceScore, 'Price');
  assertScore(technicalScore, 'Technical');
  assertScore(scheduleScore, 'Schedule');

  return createEvaluation({
    id,
    bidNoticeId: notice.id,
    proposalId: proposal.id,
    evaluatorMemberId: evaluator.id,
    priceScore,
    technicalScore,
    scheduleScore,
    note,
    totalScore: priceScore + technicalScore + scheduleScore,
    createdAt: now,
    updatedAt: now,
  });
}

export function awardNotice({ notice, proposals, selectedProposalId, actor, awardReason, now = new Date().toISOString() }) {
  assertRule(actor.role === MemberRole.Buyer, 'ONLY_BUYERS_AWARD', 'Only buyers can award notices.');
  assertRule(actor.companyId === notice.buyerCompanyId, 'NOTICE_OWNER_REQUIRED', 'Buyers can award only their own notices.');
  assertRule(notice.status === NoticeStatus.Evaluating, 'NOTICE_NOT_EVALUATING', 'A notice must be evaluating before it can be awarded.');

  const submittedProposals = proposals.filter((proposal) => proposal.status === ProposalStatus.Submitted);
  assertRule(submittedProposals.length > 0, 'NO_SUBMITTED_PROPOSALS', 'A notice cannot be awarded unless it has at least one submitted proposal.');

  const selectedProposal = submittedProposals.find((proposal) => proposal.id === selectedProposalId);
  assertRule(Boolean(selectedProposal), 'SELECTED_PROPOSAL_NOT_SUBMITTED', 'Only a submitted proposal can be selected.');

  const awardedNotice = {
    ...transitionNotice(notice, NoticeStatus.Awarded, now),
    awardedProposalId: selectedProposalId,
    awardReason,
  };

  return {
    notice: awardedNotice,
    proposals: proposals.map((proposal) => {
      if (proposal.id === selectedProposalId) {
        return { ...proposal, status: ProposalStatus.Selected, updatedAt: now };
      }
      if (proposal.status === ProposalStatus.Submitted) {
        return { ...proposal, status: ProposalStatus.NotSelected, updatedAt: now };
      }
      return proposal;
    }),
  };
}
```

- [ ] **Step 4: Run award tests**

Run: `node --test tests/domain/awards.test.mjs`

Expected: PASS with 3 award tests passing.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/awards.js tests/domain/awards.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add evaluation and award rules"
```

## Task 7: Operator Moderation and Activity Records

**Files:**
- Create: `src/domain/moderation.js`
- Test: `tests/domain/moderation.test.mjs`

- [ ] **Step 1: Write failing moderation tests**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, MemberRole, NoticeStatus, ReportStatus } from '../../src/domain/constants.js';
import { createBidNotice, createCompany, createMember, createReport } from '../../src/domain/model.js';
import { approveCompany, hideNotice, resolveReport, restoreNotice, suspendCompany } from '../../src/domain/moderation.js';

const operator = createMember({ id: 'operator', name: 'Operator', email: 'ops@example.com', role: MemberRole.Operator });
const nonOperator = createMember({ id: 'buyer', name: 'Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: 'buyer-co' });
const pendingCompany = createCompany({ id: 'supplier-co', name: 'Supplier', businessRegistrationNumber: '200', type: 'Supplier', contactName: 'Supplier', contactEmail: 'supplier@example.com' });
const publishedNotice = createBidNotice({
  id: 'notice',
  buyerCompanyId: 'buyer-co',
  title: 'Cleaning',
  category: 'Facility',
  requirements: 'Daily cleaning.',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  evaluationCriteria: 'Price 50, service 50',
  createdByMemberId: 'buyer',
  status: NoticeStatus.Published,
});

test('operator approves and suspends companies', () => {
  const approved = approveCompany({ company: pendingCompany, actor: operator, now: '2026-06-22T00:00:00.000Z' });
  const suspended = suspendCompany({ company: approved.company, actor: operator, now: '2026-06-23T00:00:00.000Z' });

  assert.equal(approved.company.status, CompanyStatus.Approved);
  assert.equal(suspended.company.status, CompanyStatus.Suspended);
  assert.equal(approved.activity.action, 'CompanyApproved');
  assert.throws(() => approveCompany({ company: pendingCompany, actor: nonOperator }), /Only operators/);
});

test('operator hides and restores notices', () => {
  const hidden = hideNotice({ notice: publishedNotice, actor: operator, reason: 'Spam report', now: '2026-06-22T00:00:00.000Z' });
  const restored = restoreNotice({ notice: hidden.notice, actor: operator, now: '2026-06-23T00:00:00.000Z' });

  assert.equal(hidden.notice.status, NoticeStatus.Hidden);
  assert.equal(restored.notice.status, NoticeStatus.Published);
});

test('operator resolves reports', () => {
  const report = createReport({ id: 'report', reporterMemberId: 'supplier', targetType: 'BidNotice', targetId: publishedNotice.id, reason: 'Suspicious notice' });

  const resolved = resolveReport({ report, actor: operator, status: ReportStatus.Resolved, now: '2026-06-22T00:00:00.000Z' });

  assert.equal(resolved.report.status, ReportStatus.Resolved);
  assert.equal(resolved.activity.action, 'ReportResolved');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/domain/moderation.test.mjs`

Expected: FAIL with module-not-found for `src/domain/moderation.js`.

- [ ] **Step 3: Implement moderation actions**

```javascript
import { ActivityAction, CompanyStatus, MemberRole, NoticeStatus } from './constants.js';
import { assertRule } from './errors.js';
import { createActivityLog } from './model.js';
import { transitionNotice } from './bid-notices.js';

function assertOperator(actor) {
  assertRule(actor.role === MemberRole.Operator, 'ONLY_OPERATORS', 'Only operators can perform this moderation action.');
}

function activity({ actor, targetType, targetId, action, metadata, now }) {
  return createActivityLog({
    id: `${action}-${targetId}-${now}`,
    actorMemberId: actor.id,
    actorCompanyId: actor.companyId || null,
    targetType,
    targetId,
    action,
    metadata,
    createdAt: now,
  });
}

export function approveCompany({ company, actor, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    company: { ...company, status: CompanyStatus.Approved, updatedAt: now },
    activity: activity({ actor, targetType: 'Company', targetId: company.id, action: ActivityAction.CompanyApproved, metadata: {}, now }),
  };
}

export function suspendCompany({ company, actor, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    company: { ...company, status: CompanyStatus.Suspended, updatedAt: now },
    activity: activity({ actor, targetType: 'Company', targetId: company.id, action: ActivityAction.CompanySuspended, metadata: {}, now }),
  };
}

export function hideNotice({ notice, actor, reason, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    notice: transitionNotice(notice, NoticeStatus.Hidden, now),
    activity: activity({ actor, targetType: 'BidNotice', targetId: notice.id, action: ActivityAction.NoticeHidden, metadata: { reason }, now }),
  };
}

export function restoreNotice({ notice, actor, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    notice: transitionNotice(notice, NoticeStatus.Published, now),
    activity: activity({ actor, targetType: 'BidNotice', targetId: notice.id, action: ActivityAction.NoticeRestored, metadata: {}, now }),
  };
}

export function resolveReport({ report, actor, status, now = new Date().toISOString() }) {
  assertOperator(actor);
  return {
    report: { ...report, status, updatedAt: now },
    activity: activity({ actor, targetType: 'Report', targetId: report.id, action: ActivityAction.ReportResolved, metadata: { status }, now }),
  };
}
```

- [ ] **Step 4: Run moderation tests**

Run: `node --test tests/domain/moderation.test.mjs`

Expected: PASS with 3 moderation tests passing.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/moderation.js tests/domain/moderation.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add operator moderation rules"
```

## Task 8: In-Memory Platform Store and Seed Data

**Files:**
- Create: `src/app/seed-data.js`
- Create: `src/app/platform-store.js`
- Test: `tests/app/platform-store.test.mjs`

- [ ] **Step 1: Write failing store workflow test**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoticeStatus, ProposalStatus } from '../../src/domain/constants.js';
import { createPlatformStore } from '../../src/app/platform-store.js';
import { createSeedData } from '../../src/app/seed-data.js';

test('store supports publish, proposal submission, evaluation, award, and supplier result view', () => {
  const store = createPlatformStore(createSeedData());

  const draft = store.createNotice('member-buyer-1', {
    id: 'notice-new',
    title: 'Mobile App Build',
    category: 'IT',
    summary: 'Build a customer app.',
    requirements: 'iOS and Android MVP.',
    budgetMin: 10000000,
    budgetMax: 20000000,
    deadlineAt: '2026-07-10T00:00:00.000Z',
    evaluationCriteria: 'Price 40, technical 40, schedule 20',
    attachmentRequirements: ['Company profile'],
  });
  const published = store.publishNotice('member-buyer-1', draft.id, '2026-06-22T00:00:00.000Z');
  const proposal = store.submitProposal('member-supplier-1', published.id, {
    id: 'proposal-new',
    price: 15000000,
    deliverySchedule: '60 days',
    proposalText: 'We will deliver native apps.',
  }, '2026-06-23T00:00:00.000Z');

  store.closeNotice(published.id, '2026-07-11T00:00:00.000Z');
  store.startEvaluation('member-buyer-1', published.id, '2026-07-11T01:00:00.000Z');
  store.recordEvaluation('member-buyer-1', proposal.id, { priceScore: 35, technicalScore: 40, scheduleScore: 18, note: 'Best fit' }, '2026-07-11T02:00:00.000Z');
  const award = store.awardNotice('member-buyer-1', published.id, proposal.id, 'Best score and realistic schedule.', '2026-07-11T03:00:00.000Z');
  const saved = store.saveNotice('member-supplier-1', 'notice-seed-1');
  const hidden = store.hideNotice('member-operator-1', 'notice-seed-1', 'Operator review requested.', '2026-07-11T04:00:00.000Z');
  const restored = store.restoreNotice('member-operator-1', 'notice-seed-1', '2026-07-11T05:00:00.000Z');

  assert.equal(award.notice.status, NoticeStatus.Awarded);
  assert.equal(store.getProposalForSupplier('member-supplier-1', proposal.id).status, ProposalStatus.Selected);
  assert.equal(saved.noticeId, 'notice-seed-1');
  assert.equal(store.listSavedNotices('member-supplier-1').length, 1);
  assert.equal(hidden.notice.status, NoticeStatus.Hidden);
  assert.equal(restored.notice.status, NoticeStatus.Published);
  assert.ok(store.listActivity().length >= 4);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/app/platform-store.test.mjs`

Expected: FAIL with module-not-found for `src/app/platform-store.js`.

- [ ] **Step 3: Create seed data**

Create `src/app/seed-data.js` with approved buyer and supplier companies, one operator, one published notice, one report, and empty arrays for proposals, evaluations, and activity:

```javascript
import { CompanyStatus, CompanyType, MemberRole, NoticeStatus } from '../domain/constants.js';
import { createBidNotice, createCompany, createMember, createReport } from '../domain/model.js';

export function createSeedData() {
  const buyerCompany = createCompany({
    id: 'company-buyer-1',
    name: 'Han River Buyers',
    businessRegistrationNumber: '101-81-00001',
    type: CompanyType.Buyer,
    status: CompanyStatus.Approved,
    contactName: 'Kim Buyer',
    contactEmail: 'buyer@example.com',
  });
  const supplierCompany = createCompany({
    id: 'company-supplier-1',
    name: 'Seoul Supplier Works',
    businessRegistrationNumber: '201-81-00002',
    type: CompanyType.Supplier,
    status: CompanyStatus.Approved,
    contactName: 'Lee Supplier',
    contactEmail: 'supplier@example.com',
  });
  const pendingSupplierCompany = createCompany({
    id: 'company-supplier-pending',
    name: 'Pending Supplier Lab',
    businessRegistrationNumber: '301-81-00003',
    type: CompanyType.Supplier,
    status: CompanyStatus.Pending,
    contactName: 'Choi Pending',
    contactEmail: 'pending@example.com',
  });

  return {
    companies: [
      buyerCompany,
      supplierCompany,
      pendingSupplierCompany,
    ],
    members: [
      createMember({ id: 'member-buyer-1', name: 'Kim Buyer', email: 'buyer@example.com', role: MemberRole.Buyer, companyId: buyerCompany.id }),
      createMember({ id: 'member-supplier-1', name: 'Lee Supplier', email: 'supplier@example.com', role: MemberRole.Supplier, companyId: supplierCompany.id }),
      createMember({ id: 'member-operator-1', name: 'Park Operator', email: 'operator@example.com', role: MemberRole.Operator }),
    ],
    notices: [
      createBidNotice({
        id: 'notice-seed-1',
        buyerCompanyId: buyerCompany.id,
        title: 'Office Network Upgrade',
        category: 'IT',
        summary: 'Upgrade office network devices.',
        requirements: 'Replace switches, install access points, and document topology.',
        budgetMin: 8000000,
        budgetMax: 12000000,
        deadlineAt: '2026-07-05T00:00:00.000Z',
        evaluationCriteria: 'Price 40, technical 40, schedule 20',
        attachmentRequirements: ['Company profile', 'Reference projects'],
        status: NoticeStatus.Published,
        createdByMemberId: 'member-buyer-1',
        publishedAt: '2026-06-22T00:00:00.000Z',
      }),
    ],
    savedNotices: [],
    proposals: [],
    evaluations: [],
    reports: [
      createReport({ id: 'report-seed-1', reporterMemberId: 'member-supplier-1', targetType: 'BidNotice', targetId: 'notice-seed-1', reason: 'Need operator review of budget range.' }),
    ],
    activity: [],
  };
}
```

- [ ] **Step 4: Implement the platform store**

Create `src/app/platform-store.js` with methods used by the test:

```javascript
import { ActivityAction, MemberRole } from '../domain/constants.js';
import { assertRule } from '../domain/errors.js';
import { createActivityLog, createBidNotice } from '../domain/model.js';
import { closeNotice as closeNoticeDomain, publishNotice as publishNoticeDomain, startEvaluation as startEvaluationDomain } from '../domain/bid-notices.js';
import { submitProposal as submitProposalDomain } from '../domain/proposals.js';
import { awardNotice as awardNoticeDomain, recordEvaluation as recordEvaluationDomain } from '../domain/awards.js';
import { hideNotice as hideNoticeDomain, restoreNotice as restoreNoticeDomain } from '../domain/moderation.js';

function replaceById(items, nextItem) {
  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

export function createPlatformStore(seed) {
  const state = structuredClone(seed);

  function member(id) {
    const found = state.members.find((item) => item.id === id);
    assertRule(Boolean(found), 'MEMBER_NOT_FOUND', `Member ${id} was not found.`);
    return found;
  }

  function company(id) {
    const found = state.companies.find((item) => item.id === id);
    assertRule(Boolean(found), 'COMPANY_NOT_FOUND', `Company ${id} was not found.`);
    return found;
  }

  function notice(id) {
    const found = state.notices.find((item) => item.id === id);
    assertRule(Boolean(found), 'NOTICE_NOT_FOUND', `Notice ${id} was not found.`);
    return found;
  }

  function proposal(id) {
    const found = state.proposals.find((item) => item.id === id);
    assertRule(Boolean(found), 'PROPOSAL_NOT_FOUND', `Proposal ${id} was not found.`);
    return found;
  }

  function record(actor, targetType, targetId, action, metadata, now) {
    state.activity.push(createActivityLog({
      id: `${action}-${targetId}-${state.activity.length + 1}`,
      actorMemberId: actor.id,
      actorCompanyId: actor.companyId,
      targetType,
      targetId,
      action,
      metadata,
      createdAt: now,
    }));
  }

  return {
    snapshot() {
      return structuredClone(state);
    },
    listActivity() {
      return [...state.activity];
    },
    saveNotice(memberId, noticeId) {
      const actor = member(memberId);
      const currentNotice = notice(noticeId);
      assertRule(actor.role === MemberRole.Supplier, 'ONLY_SUPPLIERS_SAVE_NOTICES', 'Only suppliers can save bid notices.');
      const existing = state.savedNotices.find((item) => item.memberId === memberId && item.noticeId === currentNotice.id);
      if (existing) return existing;
      const savedNotice = { memberId, noticeId: currentNotice.id, savedAt: new Date().toISOString() };
      state.savedNotices.push(savedNotice);
      return savedNotice;
    },
    listSavedNotices(memberId) {
      const actor = member(memberId);
      assertRule(actor.role === MemberRole.Supplier, 'ONLY_SUPPLIERS_VIEW_SAVED_NOTICES', 'Only suppliers can view saved notices.');
      return state.savedNotices.filter((item) => item.memberId === memberId);
    },
    createNotice(memberId, input) {
      const actor = member(memberId);
      const nextNotice = createBidNotice({ ...input, buyerCompanyId: actor.companyId, createdByMemberId: actor.id });
      state.notices.push(nextNotice);
      return nextNotice;
    },
    publishNotice(memberId, noticeId, now) {
      const actor = member(memberId);
      const current = notice(noticeId);
      const buyerCompany = company(current.buyerCompanyId);
      const next = publishNoticeDomain({ notice: current, actor, buyerCompany, now });
      state.notices = replaceById(state.notices, next);
      record(actor, 'BidNotice', next.id, ActivityAction.NoticePublished, {}, now);
      return next;
    },
    submitProposal(memberId, noticeId, input, now) {
      const actor = member(memberId);
      const supplierCompany = company(actor.companyId);
      const currentNotice = notice(noticeId);
      const next = submitProposalDomain({ actor, supplierCompany, notice: currentNotice, existingProposals: state.proposals, input, now });
      state.proposals.push(next);
      record(actor, 'Proposal', next.id, ActivityAction.ProposalSubmitted, { bidNoticeId: noticeId }, now);
      return next;
    },
    closeNotice(noticeId, now) {
      const current = notice(noticeId);
      const next = closeNoticeDomain({ notice: current, now });
      state.notices = replaceById(state.notices, next);
      return next;
    },
    startEvaluation(memberId, noticeId, now) {
      member(memberId);
      const current = notice(noticeId);
      const next = startEvaluationDomain({ notice: current, now });
      state.notices = replaceById(state.notices, next);
      return next;
    },
    recordEvaluation(memberId, proposalId, input, now) {
      const actor = member(memberId);
      const currentProposal = proposal(proposalId);
      const currentNotice = notice(currentProposal.bidNoticeId);
      const evaluation = recordEvaluationDomain({
        id: `evaluation-${state.evaluations.length + 1}`,
        notice: currentNotice,
        proposal: currentProposal,
        evaluator: actor,
        ...input,
        now,
      });
      state.evaluations.push(evaluation);
      return evaluation;
    },
    awardNotice(memberId, noticeId, selectedProposalId, awardReason, now) {
      const actor = member(memberId);
      const currentNotice = notice(noticeId);
      const relatedProposals = state.proposals.filter((item) => item.bidNoticeId === noticeId);
      const result = awardNoticeDomain({ notice: currentNotice, proposals: relatedProposals, selectedProposalId, actor, awardReason, now });
      state.notices = replaceById(state.notices, result.notice);
      state.proposals = state.proposals.map((item) => result.proposals.find((proposalItem) => proposalItem.id === item.id) || item);
      record(actor, 'BidNotice', noticeId, ActivityAction.NoticeAwarded, { selectedProposalId }, now);
      return result;
    },
    hideNotice(memberId, noticeId, reason, now) {
      const actor = member(memberId);
      const result = hideNoticeDomain({ notice: notice(noticeId), actor, reason, now });
      state.notices = replaceById(state.notices, result.notice);
      state.activity.push(result.activity);
      return result;
    },
    restoreNotice(memberId, noticeId, now) {
      const actor = member(memberId);
      const result = restoreNoticeDomain({ notice: notice(noticeId), actor, now });
      state.notices = replaceById(state.notices, result.notice);
      state.activity.push(result.activity);
      return result;
    },
    getProposalForSupplier(memberId, proposalId) {
      const actor = member(memberId);
      const currentProposal = proposal(proposalId);
      assertRule(actor.companyId === currentProposal.supplierCompanyId, 'PROPOSAL_OWNER_REQUIRED', 'Suppliers can view only their own proposal results.');
      return currentProposal;
    },
  };
}
```

- [ ] **Step 5: Run store tests**

Run: `node --test tests/app/platform-store.test.mjs`

Expected: PASS with 1 end-to-end store workflow test passing.

- [ ] **Step 6: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/seed-data.js src/app/platform-store.js tests/app/platform-store.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add bid platform in-memory store"
```

## Task 9: Role-Aware Render Functions

**Files:**
- Create: `src/ui/render.js`
- Test: `tests/ui/render.test.mjs`

- [ ] **Step 1: Write failing render tests**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeedData } from '../../src/app/seed-data.js';
import { createPlatformStore } from '../../src/app/platform-store.js';
import { renderDashboard } from '../../src/ui/render.js';

test('buyer dashboard renders notice management and proposal comparison areas', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({ state: store.snapshot(), memberId: 'member-buyer-1' });

  assert.match(html, /Buyer Portal/);
  assert.match(html, /Bid Notices/);
  assert.match(html, /Proposal Comparison/);
});

test('supplier dashboard renders discovery and submission areas', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({ state: store.snapshot(), memberId: 'member-supplier-1' });

  assert.match(html, /Supplier Portal/);
  assert.match(html, /Public Bid Discovery/);
  assert.match(html, /Saved Notices/);
  assert.match(html, /My Proposals/);
});

test('operator dashboard renders moderation areas', () => {
  const store = createPlatformStore(createSeedData());
  const html = renderDashboard({ state: store.snapshot(), memberId: 'member-operator-1' });

  assert.match(html, /Operator Console/);
  assert.match(html, /Company Review/);
  assert.match(html, /Notice Moderation/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ui/render.test.mjs`

Expected: FAIL with module-not-found for `src/ui/render.js`.

- [ ] **Step 3: Implement role-aware rendering**

```javascript
import { MemberRole, NoticeStatus } from '../domain/constants.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function findMember(state, memberId) {
  return state.members.find((member) => member.id === memberId);
}

function companyName(state, companyId) {
  return state.companies.find((company) => company.id === companyId)?.name || 'Platform';
}

function renderHeader(title, member, state) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(companyName(state, member.companyId))}</p>
        <h1>${title}</h1>
      </div>
      <span class="role-pill">${escapeHtml(member.role)}</span>
    </header>
  `;
}

function renderBuyer(state, member) {
  const notices = state.notices.filter((notice) => notice.buyerCompanyId === member.companyId);
  const proposalCount = state.proposals.filter((proposal) => notices.some((notice) => notice.id === proposal.bidNoticeId)).length;
  return `
    ${renderHeader('Buyer Portal', member, state)}
    <section class="metric-row">
      <article><strong>${notices.length}</strong><span>Bid Notices</span></article>
      <article><strong>${proposalCount}</strong><span>Submitted Proposals</span></article>
    </section>
    <section class="panel">
      <h2>Bid Notices</h2>
      ${notices.map((notice) => `<div class="list-row"><strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.status)}</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>Proposal Comparison</h2>
      <p>Compare supplier price, schedule, status, and scores for notices owned by this buyer company.</p>
    </section>
  `;
}

function renderSupplier(state, member) {
  const publicNotices = state.notices.filter((notice) => notice.status === NoticeStatus.Published);
  const myProposals = state.proposals.filter((proposal) => proposal.supplierCompanyId === member.companyId);
  const savedNotices = (state.savedNotices || []).filter((item) => item.memberId === member.id);
  return `
    ${renderHeader('Supplier Portal', member, state)}
    <section class="metric-row">
      <article><strong>${savedNotices.length}</strong><span>Saved Notices</span></article>
      <article><strong>${myProposals.length}</strong><span>My Proposals</span></article>
    </section>
    <section class="panel">
      <h2>Public Bid Discovery</h2>
      ${publicNotices.map((notice) => `<div class="list-row"><strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.category)}</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>Saved Notices</h2>
      ${savedNotices.length === 0 ? '<p>No saved notices yet.</p>' : savedNotices.map((item) => `<div class="list-row"><strong>${escapeHtml(item.noticeId)}</strong><span>Saved</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>My Proposals</h2>
      ${myProposals.length === 0 ? '<p>No proposals submitted yet.</p>' : myProposals.map((proposal) => `<div class="list-row"><strong>${escapeHtml(proposal.id)}</strong><span>${escapeHtml(proposal.status)}</span></div>`).join('')}
    </section>
  `;
}

function renderOperator(state, member) {
  const pendingCompanies = state.companies.filter((company) => company.status === 'Pending');
  const hiddenNotices = state.notices.filter((notice) => notice.status === NoticeStatus.Hidden);
  return `
    ${renderHeader('Operator Console', member, state)}
    <section class="metric-row">
      <article><strong>${pendingCompanies.length}</strong><span>Company Review</span></article>
      <article><strong>${state.reports.length}</strong><span>Open Reports</span></article>
    </section>
    <section class="panel">
      <h2>Company Review</h2>
      ${state.companies.map((company) => `<div class="list-row"><strong>${escapeHtml(company.name)}</strong><span>${escapeHtml(company.status)}</span></div>`).join('')}
    </section>
    <section class="panel">
      <h2>Notice Moderation</h2>
      <p>${hiddenNotices.length} hidden notices need review.</p>
    </section>
  `;
}

export function renderDashboard({ state, memberId }) {
  const member = findMember(state, memberId);
  if (!member) {
    return '<section class="empty-state"><h1>Member not found</h1></section>';
  }

  if (member.role === MemberRole.Buyer) return renderBuyer(state, member);
  if (member.role === MemberRole.Supplier) return renderSupplier(state, member);
  if (member.role === MemberRole.Operator) return renderOperator(state, member);
  return '<section class="empty-state"><h1>Unsupported role</h1></section>';
}
```

- [ ] **Step 4: Run render tests**

Run: `node --test tests/ui/render.test.mjs`

Expected: PASS with 3 render tests passing.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/render.js tests/ui/render.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: add role-aware dashboard rendering"
```

## Task 10: Browser Application Wiring and Usable UI

**Files:**
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Create: `src/ui/app.js`
- Test: `tests/project-structure.test.mjs`

- [ ] **Step 1: Extend the project structure test for browser wiring**

Add this test to `tests/project-structure.test.mjs`:

```javascript
test('browser entrypoint imports the app bootstrap', async () => {
  const main = await readFile('src/main.js', 'utf8');

  assert.match(main, /bootBidPlatformApp/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/project-structure.test.mjs`

Expected: FAIL because `src/main.js` does not import `bootBidPlatformApp`.

- [ ] **Step 3: Create browser app wiring**

Create `src/ui/app.js`:

```javascript
import { createSeedData } from '../app/seed-data.js';
import { createPlatformStore } from '../app/platform-store.js';
import { renderDashboard } from './render.js';

const demoMembers = [
  { id: 'member-buyer-1', label: 'Buyer' },
  { id: 'member-supplier-1', label: 'Supplier' },
  { id: 'member-operator-1', label: 'Operator' },
];

export function bootBidPlatformApp(root) {
  const store = createPlatformStore(createSeedData());
  let selectedMemberId = demoMembers[0].id;
  let message = 'Switch roles or run the demo flow to inspect the platform.';

  function runDemoFlow() {
    const draft = store.createNotice('member-buyer-1', {
      id: `notice-demo-${Date.now()}`,
      title: 'Demo Fulfillment Platform',
      category: 'Operations',
      summary: 'Build a fulfillment workflow pilot.',
      requirements: 'Design, implement, and document a pilot workflow.',
      budgetMin: 12000000,
      budgetMax: 18000000,
      deadlineAt: '2026-08-01T00:00:00.000Z',
      evaluationCriteria: 'Price 40, technical 40, schedule 20',
      attachmentRequirements: ['Company profile', 'Project plan'],
    });
    const published = store.publishNotice('member-buyer-1', draft.id, '2026-06-22T00:00:00.000Z');
    const proposal = store.submitProposal('member-supplier-1', published.id, {
      id: `proposal-demo-${Date.now()}`,
      price: 15000000,
      deliverySchedule: '50 days',
      proposalText: 'We can deliver the pilot workflow with weekly demos.',
    }, '2026-06-23T00:00:00.000Z');
    store.closeNotice(published.id, '2026-08-02T00:00:00.000Z');
    store.startEvaluation('member-buyer-1', published.id, '2026-08-02T01:00:00.000Z');
    store.recordEvaluation('member-buyer-1', proposal.id, {
      priceScore: 35,
      technicalScore: 40,
      scheduleScore: 18,
      note: 'Best practical proposal.',
    }, '2026-08-02T02:00:00.000Z');
    store.awardNotice('member-buyer-1', published.id, proposal.id, 'Best score and delivery confidence.', '2026-08-02T03:00:00.000Z');
    message = 'Demo flow completed: notice published, proposal submitted, evaluation recorded, and award selected.';
  }

  function saveSeedNotice() {
    store.saveNotice('member-supplier-1', 'notice-seed-1');
    message = 'Supplier saved the seed notice.';
  }

  function hideSeedNotice() {
    store.hideNotice('member-operator-1', 'notice-seed-1', 'Demo moderation action.', '2026-06-24T00:00:00.000Z');
    message = 'Operator hid the seed notice from supplier discovery.';
  }

  function renderActions() {
    return `
      <section class="action-bar">
        <p>${message}</p>
        <div>
          <button data-action="run-demo-flow">Run Demo Flow</button>
          <button data-action="save-seed-notice">Save Seed Notice</button>
          <button data-action="hide-seed-notice">Hide Seed Notice</button>
        </div>
      </section>
    `;
  }

  function render() {
    root.innerHTML = `
      <nav class="role-switcher" aria-label="Demo role switcher">
        ${demoMembers.map((member) => `<button data-member-id="${member.id}" class="${member.id === selectedMemberId ? 'active' : ''}">${member.label}</button>`).join('')}
      </nav>
      ${renderActions()}
      <div class="workspace">
        ${renderDashboard({ state: store.snapshot(), memberId: selectedMemberId })}
      </div>
    `;

    root.querySelectorAll('[data-member-id]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedMemberId = button.dataset.memberId;
        render();
      });
    });

    root.querySelector('[data-action="run-demo-flow"]').addEventListener('click', () => {
      runDemoFlow();
      selectedMemberId = 'member-buyer-1';
      render();
    });
    root.querySelector('[data-action="save-seed-notice"]').addEventListener('click', () => {
      saveSeedNotice();
      selectedMemberId = 'member-supplier-1';
      render();
    });
    root.querySelector('[data-action="hide-seed-notice"]').addEventListener('click', () => {
      hideSeedNotice();
      selectedMemberId = 'member-operator-1';
      render();
    });
  }

  render();
}
```

Modify `src/main.js`:

```javascript
import { bootBidPlatformApp } from './ui/app.js';

const app = document.querySelector('#app');

bootBidPlatformApp(app);
```

- [ ] **Step 4: Expand CSS for the usable operational interface**

Append these styles to `src/styles.css`:

```css
.role-switcher {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
}

button {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #ffffff;
  color: var(--ink);
  font: inherit;
  padding: 0 14px;
  cursor: pointer;
}

button.active,
button:hover {
  border-color: var(--accent);
  background: var(--accent);
  color: #ffffff;
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  background: #eef6f5;
  border-bottom: 1px solid var(--line);
}

.action-bar p {
  margin: 0;
  color: var(--accent-strong);
  font-size: 14px;
  font-weight: 700;
}

.action-bar div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.topbar h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 13px;
}

.role-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  background: #e7f5f2;
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 700;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-row article,
.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 16px;
}

.metric-row strong {
  display: block;
  font-size: 30px;
  line-height: 1;
}

.metric-row span {
  display: block;
  margin-top: 8px;
  color: var(--muted);
}

.panel {
  margin-top: 12px;
}

.panel h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}

.list-row:first-of-type {
  border-top: 0;
}

@media (max-width: 640px) {
  .role-switcher {
    overflow-x: auto;
  }

  .action-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .topbar {
    flex-direction: column;
  }

  .list-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
```

- [ ] **Step 5: Run project structure tests**

Run: `node --test tests/project-structure.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run all automated tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Manually verify the app opens**

Run: `python3 -m http.server 4173`

Open: `http://127.0.0.1:4173`

Expected: The page shows Buyer, Supplier, and Operator role buttons plus Run Demo Flow, Save Seed Notice, and Hide Seed Notice buttons. Switching roles changes the dashboard content without a page reload. Run Demo Flow creates a new awarded notice, Save Seed Notice increments the supplier saved-notice count, and Hide Seed Notice changes operator moderation status.

- [ ] **Step 8: Commit**

```bash
git add src/main.js src/styles.css src/ui/app.js tests/project-structure.test.mjs
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "feat: wire bid platform browser app"
```

## Task 11: Final Verification

**Files:**
- Modify only if a verification issue is found in files touched by Tasks 1-10.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: PASS with project, domain, app, and UI tests passing.

- [ ] **Step 2: Check source syntax**

Run: `node --check src/main.js && node --check src/ui/app.js && node --check src/ui/render.js`

Expected: No syntax errors.

- [ ] **Step 3: Start a local static server**

Run: `python3 -m http.server 4173`

Expected: Server starts on `http://0.0.0.0:4173/`.

- [ ] **Step 4: Browser smoke check**

Open: `http://127.0.0.1:4173`

Expected checks:

- Buyer dashboard shows Bid Notices and Proposal Comparison.
- Supplier dashboard shows Public Bid Discovery, Saved Notices, and My Proposals.
- Operator dashboard shows Company Review and Notice Moderation.
- Run Demo Flow creates a new awarded notice and a selected supplier proposal.
- Save Seed Notice increases the supplier saved-notice count.
- Hide Seed Notice removes the seed notice from supplier discovery and increments hidden notice review count.
- Layout remains readable at desktop width and mobile width.

- [ ] **Step 5: Final commit if verification fixes were needed**

If Step 1, Step 2, Step 3, or Step 4 required fixes, commit those fixes:

```bash
git add src tests
git -c user.name='Codex' -c user.email='codex@example.com' commit -m "fix: complete bid platform verification"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: Buyer portal, supplier portal, saved notices, operator console, notice states, proposal states, permissions, moderation, activity, and full happy-path verification are each mapped to tasks above.
- Scope check: Contracting, payment, settlement, tax invoices, external procurement integration, real-time chat, reviews, disputes, advanced hierarchy, and single sign-on remain outside the MVP as specified.
- Type consistency: The plan consistently uses `MemberRole`, `CompanyStatus`, `NoticeStatus`, `ProposalStatus`, `ReportStatus`, and entity factory names defined in Task 2.
