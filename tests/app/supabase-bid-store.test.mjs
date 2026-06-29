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

test('signUpSupplier creates a supplier login with a 14 day expiry', async () => {
  const calls = [];
  const store = createSupabaseBidStore({
    nowProvider: () => new Date('2026-06-25T00:00:00.000Z'),
    supabase: {
      auth: {
        signUp: async (payload) => {
          calls.push(payload);
          return { data: { user: { id: 'supplier-1' } }, error: null };
        },
      },
    },
  });

  const result = await store.signUpSupplier('supplier@example.com', 'secret-password');

  assert.equal(calls[0].email, 'supplier@example.com');
  assert.equal(calls[0].password, 'secret-password');
  assert.equal(calls[0].options.data.role, 'supplier');
  assert.equal(calls[0].options.data.login_expires_at, '2026-07-09T00:00:00.000Z');
  assert.equal(result.loginExpiresAt, '2026-07-09T00:00:00.000Z');
});

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
        if (table === 'participant_proposals') {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({ data: null, error: null }),
          };
        }
        assert.equal(table, 'proposals');
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

test('submitProposalFile replaces an existing supplier proposal file instead of inserting another proposal', async () => {
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
        if (table === 'participant_proposals') {
          return {
            select(columns) {
              calls.push({ table, action: 'select', columns });
              return this;
            },
            eq(column, value) {
              calls.push({ table, action: 'eq', column, value });
              return this;
            },
            maybeSingle: async () => ({
              data: {
                id: 'proposal-1',
                notice_id: 'notice-1',
                supplier_id: 'supplier-1',
                file_name: '잘못된_제안서.zip',
                file_size: 1000,
                submitted_at: '2026-06-23T09:00:00.000Z',
              },
              error: null,
            }),
          };
        }
        if (table === 'proposals') {
          return {
            update(payload) {
              calls.push({ table, action: 'update', payload });
              return this;
            },
            eq(column, value) {
              calls.push({ table, action: 'eq', column, value });
              return this;
            },
            select() { return this; },
            single: async () => ({
              data: {
                id: 'proposal-1',
                notice_id: 'notice-1',
                supplier_id: 'supplier-1',
                supplier_company_name: '서울공급웍스',
                file_path: 'notices/notice-1/suppliers/supplier-1/20260624093000-최종_제안서.zip',
                file_name: '최종_제안서.zip',
                file_size: 2048,
                status: 'submitted',
                submitted_at: '2026-06-23T09:00:00.000Z',
                updated_at: '2026-06-24T09:30:00.000Z',
              },
              error: null,
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
  });

  const proposal = await store.submitProposalFile(
    { id: 'supplier-1', companyName: '서울공급웍스' },
    'notice-1',
    { name: '최종_제안서.zip', size: 2048 }
  );

  const updateCall = calls.find((call) => call.table === 'proposals' && call.action === 'update');
  const uploadCall = calls.find((call) => call.bucket === 'proposal-files');
  assert.equal(uploadCall.path, 'notices/notice-1/suppliers/supplier-1/20260624093000-최종_제안서.zip');
  assert.equal(updateCall.payload.file_name, '최종_제안서.zip');
  assert.equal(updateCall.payload.file_size, 2048);
  assert.equal(updateCall.payload.status, 'submitted');
  assert.equal(proposal.id, 'proposal-1');
  assert.equal(proposal.file.name, '최종_제안서.zip');
  assert.equal(calls.some((call) => call.table === 'proposals' && call.payload?.notice_id), false);
});

test('replaceNoticeRequestFile updates the notice to the latest request file', async () => {
  const calls = [];
  const oldRfpPath = 'notices/notice-1/20260624093000-기존_제안요청서.pdf';
  const store = createSupabaseBidStore({
    nowProvider: () => new Date('2026-06-26T01:02:03.000Z'),
    supabase: {
      storage: {
        from(bucket) {
          return {
            upload: async (path, file, options) => {
              calls.push({ bucket, path, fileName: file.name, options });
              return { data: { path }, error: null };
            },
            remove: async (paths) => {
              calls.push({ bucket, action: 'remove', paths });
              return { data: paths.map((path) => ({ name: path })), error: null };
            },
          };
        },
      },
      from(table) {
        assert.equal(table, 'bid_notices');
        return {
          select(columns) {
            calls.push({ table, action: 'select', columns });
            return this;
          },
          update(payload) {
            calls.push({ table, action: 'update', payload });
            return this;
          },
          eq(column, value) {
            calls.push({ table, action: 'eq', column, value });
            return this;
          },
          single: async () => {
            const updateCall = calls.find((call) => call.table === 'bid_notices' && call.action === 'update');
            if (!updateCall) {
              return {
                data: { rfp_file_path: oldRfpPath },
                error: null,
              };
            }
            return {
              data: {
                id: 'notice-1',
                title: '공고',
                category: 'IT',
                summary: '요약',
                starts_at: '2026-06-24T00:00:00.000Z',
                deadline_at: '2026-06-30T09:00:00.000Z',
                status: 'published',
                created_by: 'operator-1',
                created_at: '2026-06-24T00:00:00.000Z',
                ...updateCall.payload,
              },
              error: null,
            };
          },
        };
      },
    },
  });

  const notice = await store.replaceNoticeRequestFile(
    { id: 'operator-1', role: 'Operator' },
    'notice-1',
    { name: '수정_제안요청서.pdf', size: 2048 }
  );

  const uploadCall = calls.find((call) => call.bucket === 'rfp-files');
  const removeCall = calls.find((call) => call.bucket === 'rfp-files' && call.action === 'remove');
  const updateCall = calls.find((call) => call.table === 'bid_notices' && call.action === 'update');
  assert.equal(uploadCall.path, 'notices/notice-1/20260626010203-수정_제안요청서.pdf');
  assert.deepEqual(uploadCall.options, { upsert: false });
  assert.deepEqual(removeCall.paths, [oldRfpPath]);
  assert.equal(updateCall.payload.rfp_file_path, uploadCall.path);
  assert.equal(updateCall.payload.rfp_file_name, '수정_제안요청서.pdf');
  assert.equal(updateCall.payload.rfp_file_size, 2048);
  assert.equal(updateCall.payload.updated_at, '2026-06-26T01:02:03.000Z');
  assert.equal(notice.requestFile.name, '수정_제안요청서.pdf');
});

test('cleanupExpiredProposalRevisionFiles removes old stored proposal revisions and keeps metadata marked', async () => {
  const calls = [];
  const store = createSupabaseBidStore({
    nowProvider: () => new Date('2026-08-10T00:00:00.000Z'),
    supabase: {
      rpc(name, payload) {
        calls.push({ action: 'rpc', name, payload });
        return Promise.resolve({
          data: [
            { id: 'revision-1', file_path: 'notices/notice-1/suppliers/supplier-1/20260624093000-잘못된_제안서.zip' },
            { id: 'revision-2', file_path: 'notices/notice-1/suppliers/supplier-2/20260624103000-초안_제안서.zip' },
          ],
          error: null,
        });
      },
      storage: {
        from(bucket) {
          return {
            remove: async (paths) => {
              calls.push({ bucket, action: 'remove', paths });
              return { data: paths.map((path) => ({ name: path })), error: null };
            },
          };
        },
      },
      from(table) {
        assert.equal(table, 'proposal_file_revisions');
        return {
          update(payload) {
            calls.push({ table, action: 'update', payload });
            return this;
          },
          in(column, values) {
            calls.push({ table, action: 'in', column, values });
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
  });

  const result = await store.cleanupExpiredProposalRevisionFiles({ retentionDays: 30 });

  assert.deepEqual(
    calls.find((call) => call.action === 'rpc'),
    { action: 'rpc', name: 'list_expired_proposal_revision_files', payload: { retention_days: 30 } }
  );
  assert.deepEqual(calls.find((call) => call.bucket === 'proposal-files').paths, [
    'notices/notice-1/suppliers/supplier-1/20260624093000-잘못된_제안서.zip',
    'notices/notice-1/suppliers/supplier-2/20260624103000-초안_제안서.zip',
  ]);
  assert.deepEqual(calls.find((call) => call.table === 'proposal_file_revisions' && call.action === 'update').payload, {
    storage_deleted_at: '2026-08-10T00:00:00.000Z',
  });
  assert.deepEqual(calls.find((call) => call.table === 'proposal_file_revisions' && call.action === 'in').values, ['revision-1', 'revision-2']);
  assert.deepEqual(result, { deletedCount: 2 });
});

test('loadDashboard signs operator proposal files from stored proposal paths', async () => {
  const signedUrlCalls = [];
  const proposalPath = 'notices/notice-1/suppliers/supplier-1/20260624093000-제안서.pdf';
  const store = createSupabaseBidStore({
    supabase: {
      storage: {
        from(bucket) {
          return {
            createSignedUrl: async (path, expiresIn) => {
              signedUrlCalls.push({ bucket, path, expiresIn });
              return { data: { signedUrl: 'https://signed.example/proposal.pdf' }, error: null };
            },
          };
        },
      },
      from(table) {
        if (table === 'bid_notices') {
          return createQueryResult([{
            id: 'notice-1',
            title: '공고',
            category: 'IT',
            summary: '요약',
            starts_at: '2026-06-24T09:00:00.000Z',
            deadline_at: '2026-06-30T09:00:00.000Z',
            status: 'published',
            rfp_file_path: '',
            rfp_file_name: '요청서.pdf',
            rfp_file_size: 1024,
          }]);
        }
        if (table === 'proposals') {
          return createQueryResult([{
            id: 'proposal-1',
            notice_id: 'notice-1',
            supplier_id: 'supplier-1',
            supplier_company_name: '서울공급웍스',
            file_path: proposalPath,
            file_name: '제안서.pdf',
            file_size: 2048,
            status: 'submitted',
            submitted_at: '2026-06-25T09:00:00.000Z',
          }]);
        }
        if (table === 'evaluations') return createQueryResult([]);
        throw new Error(`Unexpected table ${table}`);
      },
    },
  });

  const dashboard = await store.loadDashboard({
    id: 'operator-1',
    role: 'Operator',
    companyId: 'company-operator-1',
    companyName: '운영사',
  });

  assert.deepEqual(signedUrlCalls, [{ bucket: 'proposal-files', path: proposalPath, expiresIn: 600 }]);
  assert.equal(dashboard.proposals[0].file.url, 'https://signed.example/proposal.pdf');
});

test('loadDashboard signs supplier RFP downloads while keeping proposal status submitted and file url hidden', async () => {
  const signedUrlCalls = [];
  const rfpPath = 'notices/notice-1/20260624093000-요청서.pdf';
  const store = createSupabaseBidStore({
    supabase: {
      storage: {
        from(bucket) {
          return {
            createSignedUrl: async (path, expiresIn) => {
              signedUrlCalls.push({ bucket, path, expiresIn });
              return { data: { signedUrl: `https://signed.example/${bucket}/${path}` }, error: null };
            },
          };
        },
      },
      from(table) {
        if (table === 'participant_bid_notices') {
          return createQueryResult([{
            id: 'notice-1',
            title: '공고',
            category: 'IT',
            summary: '요약',
            starts_at: '2026-06-24T09:00:00.000Z',
            deadline_at: '2026-06-30T09:00:00.000Z',
            status: 'published',
            rfp_file_path: rfpPath,
            rfp_file_name: '요청서.pdf',
            rfp_file_size: 1024,
          }]);
        }
        if (table === 'participant_proposals') {
          return createQueryResult([{
            id: 'proposal-1',
            notice_id: 'notice-1',
            supplier_id: 'supplier-1',
            supplier_company_name: '서울공급웍스',
            file_path: 'notices/notice-1/suppliers/supplier-1/제안서.pdf',
            file_download_url: 'https://signed.example/private-result.pdf',
            file_name: '제안서.pdf',
            file_size: 2048,
            status: 'selected',
            submitted_at: '2026-06-25T09:00:00.000Z',
          }]);
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
  });

  const dashboard = await store.loadDashboard({
    id: 'supplier-1',
    role: 'Supplier',
    companyId: 'company-supplier-1',
    companyName: '서울공급웍스',
  });

  assert.deepEqual(signedUrlCalls, [{ bucket: 'rfp-files', path: rfpPath, expiresIn: 600 }]);
  assert.equal(dashboard.notices[0].requestFile.url, `https://signed.example/rfp-files/${rfpPath}`);
  assert.equal(dashboard.proposals[0].status, 'Submitted');
  assert.equal(dashboard.proposals[0].file.url, '');
});

test('evaluateSubmission updates an existing evaluation instead of inserting a duplicate', async () => {
  const calls = [];
  const store = createSupabaseBidStore({
    supabase: {
      from(table) {
        const tableName = String(table);
        if (tableName === 'proposals') {
          return {
            select(columns) {
              calls.push({ table, action: 'select', columns });
              return this;
            },
            eq(column, value) {
              calls.push({ table, action: 'eq', column, value });
              return this;
            },
            single: async () => ({ data: { notice_id: 'notice-1' }, error: null }),
          };
        }
        if (tableName === 'evaluations') {
          const query = {
            operation: '',
            payload: null,
            select(columns) {
              calls.push({ table, action: 'select', columns });
              return query;
            },
            eq(column, value) {
              calls.push({ table, action: 'eq', column, value });
              return query;
            },
            maybeSingle: async () => {
              calls.push({ table, action: 'maybeSingle' });
              return { data: { id: 'evaluation-1' }, error: null };
            },
            update(payload) {
              calls.push({ table, action: 'update', payload });
              query.operation = 'update';
              query.payload = payload;
              return query;
            },
            insert(payload) {
              calls.push({ table, action: 'insert', payload });
              query.operation = 'insert';
              query.payload = payload;
              return query;
            },
            single: async () => ({
              data: {
                id: query.operation === 'update' ? 'evaluation-1' : 'evaluation-created',
                notice_id: 'notice-1',
                proposal_id: 'proposal-1',
                evaluator_id: 'operator-1',
                score: query.payload.score,
                note: query.payload.note,
                created_at: '2026-06-25T09:00:00.000Z',
                updated_at: '2026-06-25T10:00:00.000Z',
              },
              error: null,
            }),
          };
          return query;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
  });

  const evaluation = await store.evaluateSubmission(
    { id: 'operator-1', role: 'Operator' },
    'proposal-1',
    { score: 91, note: '기존 평가 수정' }
  );

  assert.equal(evaluation.id, 'evaluation-1');
  assert.ok(calls.some((call) => call.table === 'evaluations' && call.action === 'maybeSingle'));
  assert.ok(calls.some((call) => call.table === 'evaluations' && call.action === 'update'));
  assert.ok(!calls.some((call) => call.table === 'evaluations' && call.action === 'insert'));
});

test('createOperatorNotice rejects when the browser cannot create a secure UUID', async () => {
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: {},
    configurable: true,
  });

  const store = createSupabaseBidStore({
    supabase: {
      storage: {
        from() {
          return {
            upload: async () => ({ data: {}, error: null }),
          };
        },
      },
      from() {
        return {
          insert(payload) {
            return {
              select() { return this; },
              single: async () => ({ data: payload, error: null }),
            };
          },
        };
      },
    },
  });

  try {
    await assert.rejects(
      () => store.createOperatorNotice(
        { id: 'operator-1', role: 'Operator' },
        {
          title: '공고',
          category: 'IT',
          summary: '요약',
          startsAt: '2026-06-24T09:00:00.000Z',
          deadlineAt: '2026-06-30T09:00:00.000Z',
          requestFile: { name: '요청서.pdf', size: 1024 },
        }
      ),
      /브라우저에서 안전한 UUID를 생성할 수 없습니다\./
    );
  } finally {
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
    } else {
      delete globalThis.crypto;
    }
  }
});
