# Supabase and Vercel Integration Design

## Summary

Change the Korean bid-system prototype from an in-browser demo into a deployed web app backed by Supabase and hosted on Vercel.

Vercel will serve the Vite frontend. Supabase will provide authentication, database records, and private file storage for RFP files and proposal files. Outlook remains outside the app: the app only generates mail templates and records notification completion after the operator sends mail in Outlook.

## Goals

- Deploy the app through Vercel as a Vite frontend.
- Use Supabase Auth for email/password login.
- Use Supabase `profiles.role` to separate participant and operator screens.
- Store bid notices, proposal submissions, evaluations, preferred-supplier selection, and notification completion in Supabase Postgres.
- Store operator-uploaded RFP files and participant-uploaded proposal files in Supabase Storage.
- Keep participant access limited to notice details, RFP download, proposal upload, and the participant's own submission status.
- Keep scores, evaluation notes, preferred/rejected classification, and submitted proposal file downloads visible only to operators.

## Non-Goals

- Sending email from the app.
- Receiving Outlook mail in the app.
- Contract generation, e-signatures, settlement, or payment.
- Public anonymous bidding access.
- Service-role-key usage in browser code.

## Architecture

The app becomes a Vite single-page frontend with three local layers:

- `src/integrations/supabase/`: creates the Supabase browser client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/app/supabase-bid-store.js`: replaces in-memory store operations with Supabase queries and Storage calls.
- `src/ui/`: keeps the current Korean screens, but renders from async Supabase-backed state instead of seed data.

Participant reads must go through participant-safe views or RPC functions that omit preferred-supplier fields, proposal result fields, scores, and notes. Operator reads can use the base tables after RLS verifies the operator role.

The existing domain and render tests stay useful by keeping pure transformation logic separate from Supabase I/O. Supabase-specific tests should cover SQL artifact presence, query adapter behavior with fake clients, and UI states for loading, empty data, and access-denied errors.

## Vercel

Add Vite-oriented scripts:

- `dev`: local Vite dev server.
- `build`: production bundle.
- `preview`: local production preview.
- `test`: existing node test suite.

Add `vercel.json` with a rewrite to `/index.html` so direct browser reloads keep working in the single-page app.

Vercel environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No Supabase service role key is stored in Vercel for this frontend-only version.

## Supabase Auth

Login uses Supabase email/password authentication.

`profiles.id` references `auth.users.id`. Each authenticated user has one profile:

- `role = 'supplier'` for bid participants.
- `role = 'operator'` for platform operators.
- `company_name` identifies the domestic company shown in the UI.

Initial users are created in Supabase Auth, then matching profile rows are inserted through a setup script or Supabase dashboard. The first release does not include public signup; this keeps access controlled for domestic-company use.

## Database Schema

### profiles

- `id uuid primary key references auth.users(id)`
- `email text not null`
- `name text not null`
- `company_name text not null`
- `role text not null check (role in ('supplier', 'operator'))`
- `created_at timestamptz not null default now()`

### bid_notices

- `id uuid primary key default gen_random_uuid()`
- `title text not null`
- `category text not null`
- `summary text not null`
- `starts_at timestamptz not null`
- `deadline_at timestamptz not null`
- `status text not null default 'published' check (status in ('published', 'ended'))`
- `rfp_file_path text not null`
- `rfp_file_name text not null`
- `rfp_file_size bigint not null default 0`
- `created_by uuid not null references profiles(id)`
- `preferred_proposal_id uuid null`
- `result_notified_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

New operator notices are immediately shown as `입찰중` while `status = 'published'` and the current time is before `deadline_at`.

### proposals

- `id uuid primary key default gen_random_uuid()`
- `notice_id uuid not null references bid_notices(id)`
- `supplier_id uuid not null references profiles(id)`
- `supplier_company_name text not null`
- `file_path text not null`
- `file_name text not null`
- `file_size bigint not null default 0`
- `status text not null default 'submitted' check (status in ('submitted', 'selected', 'not_selected'))`
- `submitted_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique active constraint on `(notice_id, supplier_id)` for submitted proposals

### evaluations

- `id uuid primary key default gen_random_uuid()`
- `proposal_id uuid not null references proposals(id)`
- `notice_id uuid not null references bid_notices(id)`
- `evaluator_id uuid not null references profiles(id)`
- `score numeric not null check (score >= 0 and score <= 100)`
- `note text not null default ''`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Evaluation records are operator-only. Participants cannot select from this table.

### participant_bid_notices view

This view exposes only participant-safe notice fields:

- `id`
- `title`
- `category`
- `summary`
- `starts_at`
- `deadline_at`
- `status`
- `rfp_file_path`
- `rfp_file_name`
- `rfp_file_size`

It does not expose `preferred_proposal_id` or `result_notified_at`.
The frontend uses `rfp_file_path` only to request a short-lived signed download URL for the published notice's RFP file.

### participant_proposals view

This view exposes only the logged-in participant's submission status:

- `id`
- `notice_id`
- `supplier_id`
- `file_name`
- `file_size`
- `submitted_at`
- `display_status`, always rendered as submitted/submission-complete for participants

It does not expose selected/not-selected classification.

## Storage

Use private buckets:

- `rfp-files`
- `proposal-files`

Recommended paths:

- RFP: `notices/{notice_id}/{timestamp}-{safe_file_name}`
- Proposal: `notices/{notice_id}/suppliers/{supplier_id}/{timestamp}-{safe_file_name}`

The app stores only Storage paths in Postgres. Download actions create authorized URLs or fetch blobs through Supabase Storage after RLS checks pass.

## Access Rules

### Participants

- Can read their own profile.
- Can read published notices through `participant_bid_notices`.
- Can download RFP files for published notices.
- Can upload one proposal file per open notice.
- Can read only their own proposal status through `participant_proposals`.
- Cannot read evaluations.
- Cannot read preferred/rejected classification.
- Cannot download proposal files, including their own submitted proposal file, in this release.
- Cannot read other suppliers' proposal rows or files.

### Operators

- Can create notices and upload RFP files.
- Can read all notices.
- Can read proposal metadata for ended notices.
- Can download proposal files only after `deadline_at < now()`.
- Can create and update evaluations before result notification is complete.
- Can select one preferred proposal only after every submitted proposal for the notice has an evaluation.
- Can mark result notification complete after sending Outlook mail.
- Cannot change evaluations or preferred supplier after notification completion.

## Row-Level Security

Enable RLS on all app tables.

Use helper functions in SQL:

- `current_profile_role()`
- `is_operator()`
- `is_supplier()`

Storage policies are written on `storage.objects`, scoped by bucket and path. RFP reads are allowed to authenticated users for the `rfp-files` bucket. Proposal uploads are allowed only into the current supplier's path. Proposal file reads are allowed only to operators after the related notice deadline has passed.

Do not grant participants direct `SELECT` access to base tables that include operator-only fields. Participant UI queries use views/RPCs that project only safe fields.

The service role key is never exposed to the browser. Supabase Storage documentation notes that service keys bypass RLS, so any future server-side use must stay on trusted server code only.

## UI Flow

### Login

The first screen asks for email and password. After login, the app reads the profile and routes:

- `supplier`: participant notice list and proposal upload.
- `operator`: notice creation, mail templates, evaluation, and notification completion.

### Participant

The participant sees the notice list, selected notice details, RFP download, and proposal upload. After submitting, the participant sees only the submitted file status. Evaluation score, note, and selection result remain hidden.

### Operator

The operator can create a notice with an RFP file. Created notices are immediately `입찰중`.

For open notices, the operator sees the Outlook invitation template. After the deadline, submitted files can be downloaded, scores and notes can be entered, one preferred proposal can be selected, result mail templates are generated, and notification completion can be recorded.

## Error Handling

- Missing Supabase environment variables show a Korean setup message instead of a broken login.
- Failed login shows a Korean credential error.
- File upload failures keep the form state and show a retryable message.
- Unauthorized Supabase errors show a Korean access-denied message.
- Deadline and notification locks are enforced in both UI logic and RLS/database update rules.

## Implementation Artifacts

- `vite.config.js`
- `vercel.json`
- `.env.example`
- `supabase/migrations/001_bid_platform.sql`
- `src/integrations/supabase/client.js`
- `src/app/supabase-bid-store.js`
- Updated `src/ui/app.js` to use async auth/store operations.
- Tests for Supabase config, SQL policies, storage path helpers, and role-based UI visibility.

## Verification

Local verification:

- `npm test`
- `npm run build`

Manual Supabase/Vercel verification:

1. Create Supabase project.
2. Run migration SQL.
3. Create private Storage buckets.
4. Create one operator user and one supplier user.
5. Insert matching profile rows.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local` and Vercel.
7. Login as operator, create notice with RFP file, copy Outlook invitation.
8. Login as supplier, download RFP, upload proposal.
9. After deadline, login as operator, download proposal, enter evaluation, select preferred proposal, copy result templates, record notification complete.
10. Confirm supplier cannot see score, note, preferred/rejected status, or other suppliers' files.

Detailed deployment and manual acceptance steps are maintained in `docs/deployment/supabase-vercel.md`.

## References

- Supabase JavaScript client initialization: https://supabase.com/docs/reference/javascript/initializing
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Vercel Vite deployment: https://vercel.com/docs/frameworks/frontend/vite
- Vercel environment variables: https://vercel.com/docs/environment-variables
