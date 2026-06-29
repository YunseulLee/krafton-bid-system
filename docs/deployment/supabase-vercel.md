# Supabase and Vercel Deployment

## Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/migrations/001_bid_platform.sql`.
3. Confirm Storage buckets `rfp-files` and `proposal-files` exist and are private.
4. Create one shared operator user in Supabase Auth.
5. Store the operator login URL, operator email, and a long random password in 1Password.
6. Update the generated profile row to the operator role:

```sql
update public.profiles
set
  name = '운영자',
  company_name = '플랫폼',
  role = 'operator',
  login_expires_at = null
where email = 'operator@example.com';
```

Do not put the operator password in source code, Vercel environment variables, or the static prototype. Supplier users should sign up from the app. Supplier login information expires after 14 days, and suppliers create a new account when the previous login information expires.

The public app address shows only the participant login and signup screen. The operator login is shown only on the operator address, such as `/operator` in production or `?operator=1` for the static prototype. This is only a visibility control; the real access control is still the `operator` role in Supabase policies.

## Local App

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL`.
3. Set `VITE_SUPABASE_ANON_KEY`.
4. Run `npm install`.
5. Run `npm run dev`.

If the Codex sandbox blocks local ports, run the same commands from a normal terminal on the Mac. If port `4173` is already unavailable, run `PORT=4174 npm start` for the dependency-free preview server and open `http://127.0.0.1:4174/`.

## Vercel

1. Import the repository into Vercel.
2. Set Framework Preset to Vite.
3. Set Build Command to `npm run build`.
4. Set Output Directory to `dist`.
5. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. Deploy.

Do not add a Supabase service-role key to Vercel for this frontend-only app.

## Outlook Mail Flow

The app does not send or receive Outlook mail.

1. The operator creates a notice with an RFP file.
2. The app generates the invitation subject and body.
3. The operator copies the template and sends it from Outlook.
4. After evaluation, the app generates preferred and rejected result mail templates.
5. The operator sends the result mails from Outlook.
6. The operator clicks notification complete in the app.

## Manual Acceptance

1. Login as operator.
2. Create a notice with an RFP file.
3. Confirm the notice status is shown as `입찰중`.
4. Copy the Outlook invitation template.
5. Login as supplier.
6. Download the RFP.
7. Upload a proposal file before the deadline.
8. Confirm the supplier screen only shows the submitted file status.
9. Login as operator after the deadline.
10. Download the proposal file.
11. Save scores and notes for every proposal.
12. Select one preferred proposal.
13. Confirm the remaining submitted proposals are classified as rejected.
14. Copy preferred and rejected Outlook result templates.
15. Send the mails from Outlook.
16. Click notification complete.
17. Login as supplier and confirm no score, note, preferred/rejected status, or proposal download link is visible.
