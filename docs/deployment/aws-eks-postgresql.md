# AWS EKS and AWS PostgreSQL Deployment

## Target Structure

The bid system runs on AWS instead of Supabase and Vercel.

```
User browser
  -> AWS ALB Ingress on AWS EKS
  -> krafton-bid-web frontend
  -> krafton-bid-api backend
  -> RDS PostgreSQL for bid records
  -> Amazon S3 for RFP and proposal files
```

The browser never connects directly to AWS PostgreSQL. The browser only calls the EKS API address through `VITE_BID_API_BASE_URL`.

## AWS Components

- AWS EKS: runs the web frontend, API backend, and scheduled cleanup jobs.
- RDS PostgreSQL or Aurora PostgreSQL: stores notices, supplier accounts, proposals, evaluations, and notification status.
- Amazon S3: stores RFP files, proposal files, and replacement originals for long-term retention.
- AWS ALB Ingress Controller: exposes the web and API services.
- AWS WAF or ALB listener rules: limit `/operator` and `?operator=1` access to approved office IPs.
- AWS Secrets Manager: stores PostgreSQL credentials and other backend-only secrets.
- IAM Roles for Service Accounts: allows the API pod to access S3 without static AWS keys.
- CloudWatch: collects API, web, and cleanup job logs.

## Database

Use AWS PostgreSQL, preferably RDS PostgreSQL for a first production version. Keep it in private subnets and allow access only from the EKS worker node security group.

Run the PostgreSQL schema migration from `postgres/migrations/001_bid_platform.sql`.

The schema keeps current file paths and 교체 이력 paths in PostgreSQL and stores the real file objects in Amazon S3.

## Frontend

The frontend is a dependency-free browser app served by the EKS web container. The web container runs `node scripts/start-server.mjs`, serves `dist` when a build exists, falls back to `index.html` for `/operator`, and injects public browser environment values at container runtime.

Required browser environment variable:

```bash
VITE_BID_API_BASE_URL=https://bid.example.com/api
VITE_OPERATOR_LOGIN_REVIEW_MODE=false
```

Only public browser values belong here. Do not place PostgreSQL passwords, AWS access keys, or private tokens in the frontend.

## API Server

The EKS API server owns all sensitive operations:

1. Email/password login for bidders.
2. Operator login, later replaceable with SSO.
3. Notice creation and RFP replacement, including RFP revision history.
4. Proposal upload and replacement before deadline, including proposal revision history.
5. Deadline-gated proposal downloads for operators.
6. Evaluation score and memo save.
7. Preferred supplier selection.
8. Outlook notification-complete status recording.
9. 14일 이후 자동 삭제 of expired bidder accounts.

Operator SSO can be added at this API layer without changing bidder login.

## Operator Access

The public first screen always shows bidder login. Operator login is visible during review mode, and production should set:

```bash
VITE_OPERATOR_LOGIN_REVIEW_MODE=false
OPERATOR_LOGIN_REVIEW_MODE=false
```

For production, protect `/operator` with AWS WAF or ALB rules so it is reachable only from:

- `103.114.126.33`
- `103.114.126.34`

Use the operator-login example in `infra/aws-waf/operator-path-allowlist.json`. Its default action allows bidder and API traffic, and it blocks only `/operator` or `?operator=1` requests that do not come from the approved IP set.

The API must still check the operator role after login. IP filtering is an outer gate, not the only security control.

## Bidder Account Expiry

Bidder accounts are valid for 14 days after signup.

The EKS CronJob `expired-supplier-cleanup` runs daily in Asia/Seoul and calls PostgreSQL directly with `psql`:

```sql
select * from mark_expired_supplier_accounts_deleted();
```

The function deletes expired bidder login records after 14 days. Proposal records keep the supplier company name and submitted file metadata needed for audit and evaluation continuity.

Recommended account deletion behavior:

1. Delete or deactivate the login credential.
2. Keep proposal rows, notice rows, evaluation rows, and result notification rows.
3. Keep file metadata and original file references for audit continuity.
4. Do not delete RFP or proposal file objects as part of bidder account expiry.

## 원본 파일 장기 보관

The bid system is configured to keep submitted and replaced file originals.

- The current RFP file is stored on `bid_notices`.
- Previous RFP files are stored on `rfp_file_revisions`.
- The current proposal file is stored on `proposals`.
- Previous proposal files are stored on `proposal_file_revisions`.
- Bidders only see the latest RFP and their own current proposal status.
- Operators can evaluate only the current proposal file, while the previous originals remain available as audit history.

## Amazon S3 File Storage

Use a private S3 bucket, for example `krafton-bid-files`.

Suggested prefixes:

```text
rfp/notices/{noticeId}/{timestamp}-{fileName}
proposals/notices/{noticeId}/suppliers/{supplierId}/{timestamp}-{fileName}
```

Every replacement uses a new timestamped object path, so S3 keeps each uploaded original instead of overwriting an earlier object.

Downloads should be generated by the API as short-lived signed URLs. Bidders must never receive another bidder's proposal file URL.

## Outlook Mail Flow

The app does not send or receive Outlook mail.

1. The operator creates a notice with an RFP file.
2. The app generates the invitation subject and body.
3. The operator copies the template and sends it from Outlook.
4. After evaluation, the app generates preferred and rejected result mail templates.
5. The operator sends the result mails from Outlook.
6. The operator clicks notification complete in the app.

## EKS Deployment Order

1. Create VPC, private subnets, public subnets, NAT, and security groups.
2. Create RDS PostgreSQL in private subnets.
3. Create the private S3 bucket.
4. Create EKS and install the AWS Load Balancer Controller.
5. Push frontend and API images to Amazon ECR.
6. Store DB credentials in AWS Secrets Manager, then sync them into Kubernetes secrets through your chosen secret operator.
7. Apply Kubernetes manifests in `infra/k8s`.
8. Configure Route 53 and ACM for the domain.
9. Apply WAF or ALB operator-path restrictions.
10. Run manual acceptance.

## Manual Acceptance

1. Login as operator.
2. Create a notice with an RFP file.
3. Confirm the notice status is shown as `입찰중`.
4. Copy the Outlook invitation template.
5. Login as bidder.
6. Download the RFP.
7. Upload a proposal file before the deadline.
8. Confirm the bidder screen only shows the submitted file status.
9. Login as operator after the deadline.
10. Download the proposal file.
11. Save scores and notes for every proposal.
12. Select one preferred proposal.
13. Confirm the remaining submitted proposals are classified as rejected.
14. Copy preferred and rejected Outlook result templates.
15. Send the mails from Outlook.
16. Click notification complete.
17. Login as bidder and confirm no score, note, preferred/rejected status, or proposal download link is visible.
