# Bid Platform MVP Design

## Summary

Build a two-sided bid platform MVP where buyers post bid notices, suppliers discover notices and submit proposals, and buyers select winning proposals. The first release covers notice publication, proposal submission, comparison, evaluation, and winner selection. Contracting, payment, settlement, tax invoices, reviews, external procurement integrations, and real-time chat are out of scope for the MVP.

## Product Scope

The platform serves three work areas:

- Buyer portal: company onboarding, bid notice creation, proposal review, evaluation, and winner selection.
- Supplier portal: company onboarding, public bid discovery, saved notices, proposal submission, and result tracking.
- Operator console: member and company review, notice visibility moderation, report handling, and account suspension.

The MVP is complete when a buyer can publish a bid notice, at least one supplier can submit a proposal before the deadline, the buyer can compare submitted proposals, and the buyer can select a winning supplier while the platform records the important activity history.

## Non-Goals

The MVP does not include:

- Contract document generation or e-signature.
- Payment, escrow, platform fee, settlement, or tax invoice workflows.
- Public procurement portal integration.
- Real-time chat between buyers and suppliers.
- Supplier reviews, ratings, or dispute resolution workflows.
- Advanced organization hierarchy, approval chains, or single sign-on.

These can be added after the core bid transaction flow is validated.

## Users and Roles

### Buyer

A buyer belongs to a buyer company. Buyers can create and manage bid notices for their own company, view proposals submitted to their notices, score or compare proposals, and select a winner.

### Supplier

A supplier belongs to a supplier company. Suppliers can view public notices, save notices, submit proposals, update proposals before the deadline, withdraw proposals before the deadline, and view their submission status.

### Operator

An operator manages platform trust and safety. Operators can approve or suspend companies, hide inappropriate notices, restore hidden notices, view report queues, and inspect activity history. Operators cannot edit supplier proposal content or select winners on behalf of buyers.

## Core Workflow

1. A buyer signs in and creates a bid notice as a draft.
2. The buyer enters the title, category, budget range, deadline, delivery or service requirements, evaluation criteria, and attachment requirements.
3. The buyer publishes the notice.
4. Suppliers browse and filter public notices.
5. A supplier opens a notice and submits a proposal with price, delivery schedule, proposal text, and optional attachments.
6. The supplier can revise or withdraw the proposal before the deadline.
7. When the deadline passes, the notice moves to the Closed state.
8. The buyer starts evaluation, compares submitted proposals, records evaluation scores, and selects one winning proposal.
9. The platform records the winner, selection reason, selected proposal snapshot, and activity history.
10. Suppliers can see whether their proposal was selected or not selected.

## Bid Notice States

Bid notices move through these states:

- Draft: visible only to the buyer company.
- Published: visible to suppliers and open for proposals.
- Closed: deadline has passed or the buyer manually closed submissions.
- Evaluating: buyer is reviewing submitted proposals.
- Awarded: buyer has selected a winning proposal.
- Ended: bid is finalized and no further changes are allowed.
- Hidden: operator has removed the notice from public discovery because of moderation or policy issues.

Allowed transitions:

- Draft to Published.
- Published to Closed.
- Published to Hidden.
- Hidden to Published.
- Closed to Evaluating.
- Evaluating to Awarded.
- Awarded to Ended.

The system must reject transitions outside this sequence.

## Proposal States

Proposals move through these states:

- Draft: supplier is preparing a proposal.
- Submitted: proposal is visible to the buyer.
- Withdrawn: supplier withdrew the proposal before the deadline.
- Selected: buyer selected this proposal as the winner.
- NotSelected: buyer awarded another proposal.

Only submitted proposals can be selected. Suppliers can revise or withdraw a submitted proposal only while the bid notice is still published and before the deadline.

## Screens

### Public and Shared Screens

- Landing and sign-in screen.
- Role-aware dashboard after sign-in.
- Company profile setup.

### Buyer Portal

- Buyer dashboard with active notices, deadlines, proposal counts, and awards.
- Bid notice list with filters by status, category, deadline, and owner.
- Bid notice editor for draft creation and updates.
- Bid notice detail with activity, requirements, attachments, and proposal summary.
- Proposal comparison table showing supplier, price, schedule, status, scores, and submitted time.
- Evaluation view for score entry and selection reason.
- Award confirmation screen.

### Supplier Portal

- Supplier dashboard with saved notices, submitted proposals, and result status.
- Public bid notice search with filters by category, deadline, budget range, and status.
- Bid notice detail for reading requirements and starting a proposal.
- Proposal editor with price, schedule, proposal text, and attachments.
- Submission history and result view.

### Operator Console

- Operator dashboard with pending company reviews, reported notices, hidden notices, and recent activity.
- Company management screen for approval, suspension, and restoration.
- Notice moderation screen for hiding and restoring notices.
- Activity log search.

## Data Model

### Member

- id
- name
- email
- role: Buyer, Supplier, Operator
- companyId, nullable for operator accounts
- status: Active, Suspended
- createdAt
- updatedAt

### Company

- id
- name
- businessRegistrationNumber
- type: Buyer, Supplier
- status: Pending, Approved, Suspended
- contactName
- contactEmail
- createdAt
- updatedAt

### BidNotice

- id
- buyerCompanyId
- title
- category
- summary
- requirements
- budgetMin
- budgetMax
- deadlineAt
- evaluationCriteria
- attachmentRequirements
- status
- createdByMemberId
- awardedProposalId
- awardReason
- createdAt
- updatedAt
- publishedAt
- closedAt
- awardedAt

### Proposal

- id
- bidNoticeId
- supplierCompanyId
- price
- deliverySchedule
- proposalText
- attachmentIds
- status
- submittedAt
- withdrawnAt
- createdAt
- updatedAt

### Evaluation

- id
- bidNoticeId
- proposalId
- evaluatorMemberId
- priceScore
- technicalScore
- scheduleScore
- note
- totalScore
- createdAt
- updatedAt

### ActivityLog

- id
- actorMemberId
- actorCompanyId
- targetType
- targetId
- action
- metadata
- createdAt

### Report

- id
- reporterMemberId
- targetType
- targetId
- reason
- status: Open, Resolved, Dismissed
- createdAt
- updatedAt

## Permissions

- Buyers can manage only notices owned by their company.
- Buyers can view proposals only for notices owned by their company.
- Suppliers can view published notices unless the notice is hidden.
- Suppliers can create proposals only for published notices before the deadline.
- Suppliers can view and edit only proposals from their own company.
- Operators can approve, suspend, hide, restore, and inspect, but cannot edit proposal content or award notices.
- Suspended companies cannot publish notices or submit proposals.

## Validation and Error Handling

The server must enforce these business rules:

- A notice cannot be published without a title, category, requirements, deadline, and evaluation criteria.
- A deadline must be in the future when publishing.
- A supplier cannot submit to its own buyer company's notice.
- A supplier cannot submit more than one active proposal to the same notice.
- A supplier cannot submit, update, or withdraw a proposal after the deadline.
- A withdrawn proposal cannot be selected.
- A notice cannot be awarded unless it has at least one submitted proposal.
- Only one proposal can be selected as the winner for a notice.
- Awarding a notice marks other submitted proposals as NotSelected.
- Hidden notices do not appear in supplier discovery.
- Suspended companies cannot take new transactional actions.

User-facing errors should explain the blocking rule in plain language. Internal errors should be logged with enough context to trace the affected user, company, notice, or proposal.

## Activity History

The platform records activity for:

- Company approval, suspension, and restoration.
- Notice creation, publication, closing, hiding, restoration, awarding, and ending.
- Proposal submission, update, withdrawal, selection, and non-selection.
- Report creation and resolution.

Activity history supports auditability and operator investigation.

## Testing Requirements

Automated tests must cover these behaviors:

- Buyers can publish valid notices and cannot publish incomplete notices.
- Notices follow the allowed state transitions only.
- Suppliers can discover published notices and cannot discover hidden notices.
- Suppliers can submit proposals before the deadline.
- Suppliers cannot submit after the deadline.
- Suppliers cannot submit more than one active proposal to the same notice.
- Suppliers can update or withdraw their own proposals before the deadline only.
- Buyers can view and compare proposals for their own notices only.
- Buyers cannot award notices with no submitted proposals.
- Awarding one proposal marks the selected proposal as Selected and other submitted proposals as NotSelected.
- Operators can hide and restore notices.
- Suspended companies cannot publish notices or submit proposals.

End-to-end verification should demonstrate the full happy path: buyer publishes a notice, supplier submits a proposal, buyer evaluates proposals, buyer awards the notice, and supplier sees the result.

## Implementation Boundaries

The first implementation should keep domain rules separate from UI code so that bid state transitions, proposal deadlines, permissions, and award selection can be tested directly. UI screens should call application services or API handlers instead of duplicating business rules.

The design assumes a single deployable web application for the MVP, with role-based navigation for buyer, supplier, and operator experiences. The architecture can later split into separate services if traffic, compliance, or team ownership requires it.
