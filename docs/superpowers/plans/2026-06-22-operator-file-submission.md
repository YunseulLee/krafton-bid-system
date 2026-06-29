# Operator File Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the MVP into a two-mode app where participants select a bid notice and upload a proposal file, while operators create notices, set periods, and review/evaluate submitted files only after the notice period ends.

**Architecture:** Keep the static ES module app and in-memory store. Store only proposal file metadata, not file contents, so the current no-backend app remains simple and safe. Preserve existing domain modules where possible and add store-level workflow methods for the new operator/participant path.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, Node.js `node:test`, Node.js `assert/strict`.

---

### Task 1: Store Workflow

**Files:**
- Modify: `src/app/platform-store.js`
- Modify: `src/app/seed-data.js`
- Test: `tests/app/operator-file-submission.test.mjs`

- [ ] Add failing tests for operator-created notices, participant file submission, locked file review before deadline, unlocked review after deadline, and operator evaluation.
- [ ] Implement store methods: `createOperatorNotice`, `submitProposalFile`, `listOperatorSubmissions`, and `evaluateSubmission`.
- [ ] Seed one active notice and one ended notice with a submitted file for evaluation demos.

### Task 2: Participant and Operator Screens

**Files:**
- Modify: `src/ui/render.js`
- Modify: `src/ui/app.js`
- Modify: `src/styles.css`
- Test: `tests/ui/render.test.mjs`

- [ ] Add failing render tests for the participant-first notice list, file upload area, operator notice creation form, locked file message, and evaluation area.
- [ ] Render two modes: `입찰 참여` and `운영자`.
- [ ] Wire notice selection, file metadata capture, proposal submission, notice creation, and evaluation.

### Task 3: Verification

**Files:**
- Existing test suite and browser app.

- [ ] Run `npm test`.
- [ ] Run `node --check` for changed JavaScript entrypoints.
- [ ] Refresh `http://localhost:4173` and verify participant upload and operator review behavior.
