import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiBidStore } from '../../src/app/api-bid-store.js';

test('createApiBidStore signs in through the EKS API and maps the member row', async () => {
  const calls = [];
  const store = createApiBidStore({
    api: {
      post: async (path, body) => {
        calls.push({ path, body });
        return {
          data: {
            status: 'signed_in',
            member: {
              id: 'supplier-1',
              email: 'supplier@example.com',
              name: '이입찰',
              company_name: '서울공급웍스',
              role: 'supplier',
              login_expires_at: '2026-07-21T00:00:00.000Z',
            },
          },
          error: null,
        };
      },
    },
  });

  const session = await store.signIn('supplier@example.com', 'secret-password');

  assert.deepEqual(calls, [{ path: '/auth/login', body: { email: 'supplier@example.com', password: 'secret-password' } }]);
  assert.equal(session.status, 'signed_in');
  assert.equal(session.member.role, 'Supplier');
  assert.equal(session.member.companyName, '서울공급웍스');
  assert.equal(session.member.loginExpiresAt, '2026-07-21T00:00:00.000Z');
});

test('createApiBidStore sends proposal files through the EKS API instead of browser database access', async () => {
  let request;
  const store = createApiBidStore({
    api: {
      post: async (path, body) => {
        request = { path, body };
        return {
          data: {
            id: 'proposal-1',
            notice_id: 'notice-1',
            supplier_id: 'supplier-1',
            supplier_company_name: '서울공급웍스',
            file_name: 'proposal.zip',
            file_size: 1024,
            status: 'submitted',
            submitted_at: '2026-07-07T09:00:00.000Z',
          },
          error: null,
        };
      },
    },
  });

  const proposal = await store.submitProposalFile(
    { id: 'supplier-1', role: 'Supplier' },
    'notice-1',
    new File(['zip'], 'proposal.zip', { type: 'application/zip' })
  );

  assert.equal(request.path, '/notices/notice-1/proposals');
  assert.equal(request.body.get('proposalFile').name, 'proposal.zip');
  assert.equal(proposal.status, 'Submitted');
  assert.equal(proposal.file.url, '');
});

test('createApiBidStore keeps supplier dashboard data limited to the signed-in supplier', async () => {
  const store = createApiBidStore({
    api: {
      get: async (path) => {
        assert.equal(path, '/dashboard');
        return {
          data: {
            member: {
              id: 'supplier-1',
              email: 'supplier@example.com',
              name: '이입찰',
              company_name: '서울공급웍스',
              role: 'supplier',
            },
            members: [
              {
                id: 'supplier-1',
                email: 'supplier@example.com',
                name: '이입찰',
                company_name: '서울공급웍스',
                role: 'supplier',
              },
              {
                id: 'supplier-2',
                email: 'other@example.com',
                name: '박입찰',
                company_name: '부산제안파트너스',
                role: 'supplier',
              },
            ],
            companies: [
              { id: 'company-supplier-1', name: '서울공급웍스' },
              { id: 'company-supplier-2', name: '부산제안파트너스' },
            ],
            notices: [{
              id: 'notice-1',
              title: '네트워크 고도화',
              category: '정보기술',
              summary: '요약',
              starts_at: '2026-07-01T00:00:00.000Z',
              deadline_at: '2026-07-10T09:00:00.000Z',
              status: 'published',
              rfp_file_name: '요청서.pdf',
              rfp_file_size: 1024,
            }],
            proposals: [
              {
                id: 'proposal-own',
                notice_id: 'notice-1',
                supplier_id: 'supplier-1',
                supplier_company_name: '서울공급웍스',
                file_name: '우리회사_제안서.zip',
                file_size: 2048,
                file_download_url: 'https://signed.example/own',
                status: 'selected',
                submitted_at: '2026-07-02T00:00:00.000Z',
              },
              {
                id: 'proposal-other',
                notice_id: 'notice-1',
                supplier_id: 'supplier-2',
                supplier_company_name: '부산제안파트너스',
                file_name: '타회사_제안서.zip',
                file_size: 4096,
                file_download_url: 'https://signed.example/other',
                status: 'submitted',
                submitted_at: '2026-07-02T01:00:00.000Z',
              },
            ],
            evaluations: [{
              id: 'evaluation-1',
              notice_id: 'notice-1',
              proposal_id: 'proposal-own',
              evaluator_id: 'operator-1',
              score: 95,
              note: '민감한 평가 메모',
            }],
          },
          error: null,
        };
      },
    },
  });

  const dashboard = await store.loadDashboard({
    id: 'supplier-1',
    role: 'Supplier',
    companyId: 'company-supplier-1',
    companyName: '서울공급웍스',
  });

  assert.deepEqual(dashboard.members.map((member) => member.id), ['supplier-1']);
  assert.deepEqual(dashboard.companies.map((company) => company.name), ['서울공급웍스']);
  assert.deepEqual(dashboard.proposals.map((proposal) => proposal.id), ['proposal-own']);
  assert.equal(dashboard.proposals[0].file.url, '');
  assert.equal(dashboard.proposals[0].status, 'Submitted');
  assert.deepEqual(dashboard.evaluations, []);
});

test('createApiBidStore sanitizes app-shaped supplier proposals from broad API responses', async () => {
  const store = createApiBidStore({
    api: {
      get: async (path) => {
        assert.equal(path, '/dashboard');
        return {
          data: {
            member: {
              id: 'supplier-1',
              email: 'supplier@example.com',
              name: '이입찰',
              companyId: 'company-supplier-1',
              companyName: '서울공급웍스',
              role: 'Supplier',
            },
            proposals: [
              {
                id: 'proposal-own',
                bidNoticeId: 'notice-1',
                supplierCompanyId: 'company-supplier-1',
                submittedByMemberId: 'supplier-1',
                supplierCompanyName: '서울공급웍스',
                file: {
                  name: '우리회사_제안서.zip',
                  size: 2048,
                  url: 'https://signed.example/own',
                },
                status: 'Selected',
                submittedAt: '2026-07-02T00:00:00.000Z',
              },
              {
                id: 'proposal-other-company-name-collision',
                bidNoticeId: 'notice-1',
                supplierCompanyId: 'company-supplier-2',
                submittedByMemberId: 'supplier-2',
                supplierCompanyName: '서울공급웍스',
                file: {
                  name: '타회사_제안서.zip',
                  size: 4096,
                  url: 'https://signed.example/other',
                },
                status: 'Submitted',
                submittedAt: '2026-07-02T01:00:00.000Z',
              },
            ],
            evaluations: [{
              id: 'evaluation-1',
              bidNoticeId: 'notice-1',
              proposalId: 'proposal-own',
              totalScore: 95,
              note: '민감한 평가 메모',
            }],
          },
          error: null,
        };
      },
    },
  });

  const dashboard = await store.loadDashboard({
    id: 'supplier-1',
    role: 'Supplier',
    companyId: 'company-supplier-1',
    companyName: '서울공급웍스',
  });

  assert.deepEqual(dashboard.proposals.map((proposal) => proposal.id), ['proposal-own']);
  assert.equal(dashboard.proposals[0].status, 'Submitted');
  assert.equal(dashboard.proposals[0].file.url, '');
  assert.deepEqual(dashboard.evaluations, []);
});
