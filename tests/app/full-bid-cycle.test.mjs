import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanyStatus, CompanyType, MemberRole, ProposalStatus } from '../../src/domain/constants.js';
import { createCompany, createMember } from '../../src/domain/model.js';
import { createSeedData } from '../../src/app/seed-data.js';
import { createPlatformStore } from '../../src/app/platform-store.js';
import { renderDashboard } from '../../src/ui/render.js';

const operatorId = 'member-operator-1';
const supplierProfiles = [
  {
    memberId: 'member-supplier-1',
    companyId: 'company-supplier-1',
    companyName: '서울공급웍스',
    contactName: '이공급',
    email: 'supplier@example.com',
  },
  {
    memberId: 'member-supplier-qa-b',
    companyId: 'company-supplier-qa-b',
    companyName: '부산제안파트너스',
    contactName: '박제안',
    email: 'supplier-b@example.com',
  },
  {
    memberId: 'member-supplier-qa-c',
    companyId: 'company-supplier-qa-c',
    companyName: '대전테크솔루션',
    contactName: '최검토',
    email: 'supplier-c@example.com',
  },
  {
    memberId: 'member-supplier-qa-d',
    companyId: 'company-supplier-qa-d',
    companyName: '광주인프라랩',
    contactName: '정제안',
    email: 'supplier-d@example.com',
  },
  {
    memberId: 'member-supplier-qa-e',
    companyId: 'company-supplier-qa-e',
    companyName: '인천보안시스템',
    contactName: '한입찰',
    email: 'supplier-e@example.com',
  },
];

function createQaSeed() {
  const seed = createSeedData();
  supplierProfiles.slice(1).forEach((supplier, index) => {
    seed.companies.push(createCompany({
      id: supplier.companyId,
      name: supplier.companyName,
      businessRegistrationNumber: `202-81-9000${index + 2}`,
      type: CompanyType.Supplier,
      status: CompanyStatus.Approved,
      contactName: supplier.contactName,
      contactEmail: supplier.email,
    }));
    seed.members.push(createMember({
      id: supplier.memberId,
      name: supplier.contactName,
      email: supplier.email,
      role: MemberRole.Supplier,
      companyId: supplier.companyId,
    }));
  });
  return seed;
}

function day(cycle, offset, hour = '09') {
  return `2026-08-${String(cycle + offset).padStart(2, '0')}T${hour}:00:00.000Z`;
}

test('ten complete bid cycles with five suppliers keep submissions private until deadline and lock results after Outlook notification', () => {
  const store = createPlatformStore(createQaSeed());

  for (let cycle = 1; cycle <= 10; cycle += 1) {
    const noticeId = `qa-notice-${cycle}`;
    const notice = store.createOperatorNotice(operatorId, {
      id: noticeId,
      title: `QA 반복 입찰 ${cycle}`,
      category: '정보기술',
      summary: `QA 반복 입찰 ${cycle} 설명입니다.`,
      requirements: '제안서 파일을 압축 파일로 제출합니다.',
      startsAt: day(cycle, 0),
      deadlineAt: day(cycle, 4, '18'),
      requestFile: {
        name: `qa-rfp-${cycle}.pdf`,
        size: 300000 + cycle,
        type: 'application/pdf',
      },
    }, day(cycle, 0));

    assert.equal(notice.status, 'Published');
    assert.equal(notice.requestFile.name, `qa-rfp-${cycle}.pdf`);

    const proposals = supplierProfiles.map((supplier, index) => {
      const supplierNumber = index + 1;
      const draft = store.submitProposalFile(supplier.memberId, noticeId, {
        name: `supplier-${supplierNumber}-draft-${cycle}.zip`,
        size: 500000 + cycle + index,
        type: 'application/zip',
      }, day(cycle, 1, String(9 + index).padStart(2, '0')));
      const final = store.submitProposalFile(supplier.memberId, noticeId, {
        name: `supplier-${supplierNumber}-final-${cycle}.zip`,
        size: 600000 + cycle + index,
        type: 'application/zip',
      }, day(cycle, 2, String(9 + index).padStart(2, '0')));

      assert.equal(final.id, draft.id);
      assert.equal(final.file.name, `supplier-${supplierNumber}-final-${cycle}.zip`);
      assert.equal(final.fileHistory.length, 1);
      assert.equal(final.fileHistory[0].name, `supplier-${supplierNumber}-draft-${cycle}.zip`);

      return final;
    });

    assert.throws(
      () => store.submitProposalFile(supplierProfiles[1].memberId, noticeId, {
        name: `supplier-2-after-deadline-${cycle}.zip`,
        size: 900000 + cycle,
        type: 'application/zip',
      }, day(cycle, 5)),
      { code: 'NOTICE_NOT_OPEN' }
    );

    const beforeDeadline = store.listOperatorSubmissions(operatorId, noticeId, day(cycle, 3));
    assert.equal(beforeDeadline.canOpenFiles, false);
    assert.equal(beforeDeadline.submissions.length, supplierProfiles.length);
    assert.deepEqual(beforeDeadline.submissions.map((submission) => submission.file), Array(supplierProfiles.length).fill(null));

    assert.throws(
      () => store.evaluateSubmission(operatorId, proposals[0].id, {
        score: 90,
        note: '마감 전 평가 시도입니다.',
      }, day(cycle, 3)),
      { code: 'NOTICE_PERIOD_NOT_ENDED' }
    );

    const afterDeadline = store.listOperatorSubmissions(operatorId, noticeId, day(cycle, 5));
    assert.equal(afterDeadline.canOpenFiles, true);
    assert.deepEqual(
      afterDeadline.submissions.map((submission) => submission.file.name).sort(),
      supplierProfiles.map((_, index) => `supplier-${index + 1}-final-${cycle}.zip`).sort()
    );

    proposals.slice(0, -1).forEach((proposal, index) => {
      store.evaluateSubmission(operatorId, proposal.id, {
        score: 90 - index + cycle,
        note: `${index + 1}번 업체 ${cycle}차 평가`,
      }, day(cycle, 5));
    });

    assert.throws(
      () => store.selectPreferredProposal(operatorId, proposals[0].id, day(cycle, 5)),
      { code: 'EVALUATION_REQUIRED_BEFORE_SELECTION' }
    );

    store.evaluateSubmission(operatorId, proposals.at(-1).id, {
      score: 80 + cycle,
      note: `5번 업체 ${cycle}차 평가`,
    }, day(cycle, 5));

    const result = store.selectPreferredProposal(operatorId, proposals[0].id, day(cycle, 5));
    assert.equal(result.selectedProposal.status, ProposalStatus.Selected);
    assert.equal(result.rejectedProposals.length, supplierProfiles.length - 1);
    assert.deepEqual(
      result.rejectedProposals.map((proposal) => proposal.status),
      Array(supplierProfiles.length - 1).fill(ProposalStatus.NotSelected)
    );

    supplierProfiles.forEach((supplier, index) => {
      const participantHtml = renderDashboard({
        state: store.snapshot(),
        memberId: supplier.memberId,
        selectedNoticeId: noticeId,
        now: day(cycle, 5),
      });
      assert.match(participantHtml, new RegExp(`supplier-${index + 1}-final-${cycle}\\.zip`));
      supplierProfiles.forEach((otherSupplier, otherIndex) => {
        if (otherSupplier.memberId === supplier.memberId) return;
        assert.doesNotMatch(participantHtml, new RegExp(`supplier-${otherIndex + 1}-final-${cycle}\\.zip`));
        assert.doesNotMatch(participantHtml, new RegExp(otherSupplier.companyName));
      });
      assert.doesNotMatch(participantHtml, /평가 점수|평가 메모|우선대상자|탈락자|제안서 다운로드/);
    });

    const notified = store.markResultNotificationComplete(operatorId, noticeId, day(cycle, 5));
    assert.equal(notified.resultNotifiedAt, day(cycle, 5));

    assert.throws(
      () => store.evaluateSubmission(operatorId, proposals[0].id, {
        score: 70,
        note: '통보 후 평가 수정 시도입니다.',
      }, day(cycle, 5)),
      { code: 'RESULT_NOTIFICATION_ALREADY_COMPLETE' }
    );
    assert.throws(
      () => store.selectPreferredProposal(operatorId, proposals[1].id, day(cycle, 5)),
      { code: 'RESULT_NOTIFICATION_ALREADY_COMPLETE' }
    );
  }
});

test('ten additional bid cycles cover deadline boundary and rotated preferred suppliers', () => {
  const store = createPlatformStore(createQaSeed());

  for (let cycle = 11; cycle <= 20; cycle += 1) {
    const noticeId = `qa-boundary-notice-${cycle}`;

    assert.throws(
      () => store.createOperatorNotice(operatorId, {
        id: `qa-invalid-notice-${cycle}`,
        title: '   ',
        category: '정보기술',
        summary: `필수값 누락 확인 ${cycle}`,
        startsAt: day(cycle, 0, '08'),
        deadlineAt: day(cycle, 4, '18'),
        requestFile: {
          name: `qa-invalid-rfp-${cycle}.pdf`,
          size: 300000 + cycle,
          type: 'application/pdf',
        },
      }, day(cycle, 0, '08')),
      { code: 'NOTICE_REQUIRED_FIELDS' }
    );

    const notice = store.createOperatorNotice(operatorId, {
      id: noticeId,
      title: `QA 경계 입찰 ${cycle}`,
      category: '정보보안',
      summary: `마감 정각과 권한 경계를 확인하는 ${cycle}차 입찰입니다.`,
      requirements: '제안서 파일은 압축 파일로 제출합니다.',
      startsAt: day(cycle, 0, '08'),
      deadlineAt: day(cycle, 4, '18'),
      requestFile: {
        name: `qa-boundary-rfp-${cycle}.pdf`,
        size: 310000 + cycle,
        type: 'application/pdf',
      },
    }, day(cycle, 0, '08'));

    assert.equal(notice.status, 'Published');

    assert.throws(
      () => store.submitProposalFile(supplierProfiles[0].memberId, noticeId, {}, day(cycle, 1, '09')),
      { code: 'PROPOSAL_FILE_REQUIRED' }
    );

    const proposals = supplierProfiles.map((supplier, index) => {
      const supplierNumber = index + 1;
      const submitted = store.submitProposalFile(supplier.memberId, noticeId, {
        name: `boundary-supplier-${supplierNumber}-submitted-${cycle}.zip`,
        size: 500000 + cycle + index,
        type: 'application/zip',
      }, day(cycle, 1, String(9 + index).padStart(2, '0')));

      if (index % 2 === 1) return submitted;

      const replaced = store.submitProposalFile(supplier.memberId, noticeId, {
        name: `boundary-supplier-${supplierNumber}-final-${cycle}.zip`,
        size: 650000 + cycle + index,
        type: 'application/zip',
      }, day(cycle, 2, String(9 + index).padStart(2, '0')));

      assert.equal(replaced.id, submitted.id);
      assert.equal(replaced.fileHistory.length, 1);
      return replaced;
    });

    assert.throws(
      () => store.submitProposalFile(supplierProfiles[2].memberId, noticeId, {
        name: `boundary-supplier-3-exact-deadline-${cycle}.zip`,
        size: 700000 + cycle,
        type: 'application/zip',
      }, day(cycle, 4, '18')),
      { code: 'NOTICE_NOT_OPEN' }
    );

    const oneHourBeforeDeadline = store.listOperatorSubmissions(operatorId, noticeId, day(cycle, 4, '17'));
    assert.equal(oneHourBeforeDeadline.canOpenFiles, false);
    assert.deepEqual(oneHourBeforeDeadline.submissions.map((submission) => submission.file), Array(supplierProfiles.length).fill(null));

    const exactDeadline = store.listOperatorSubmissions(operatorId, noticeId, day(cycle, 4, '18'));
    assert.equal(exactDeadline.canOpenFiles, true);
    assert.equal(exactDeadline.submissions.length, supplierProfiles.length);
    assert.equal(exactDeadline.submissions.every((submission) => submission.file?.name), true);

    store.evaluateSubmission(operatorId, proposals[0].id, {
      score: 70 + cycle,
      note: `1번 업체 ${cycle}차 경계 평가`,
    }, day(cycle, 4, '18'));

    assert.throws(
      () => store.selectPreferredProposal(operatorId, proposals[0].id, day(cycle, 4, '18')),
      { code: 'EVALUATION_REQUIRED_BEFORE_SELECTION' }
    );

    proposals.slice(1).forEach((proposal, index) => {
      store.evaluateSubmission(operatorId, proposal.id, {
        score: 80 + index,
        note: `${index + 2}번 업체 ${cycle}차 경계 평가`,
      }, day(cycle, 4, '18'));
    });

    const preferredIndex = cycle % supplierProfiles.length;
    const result = store.selectPreferredProposal(operatorId, proposals[preferredIndex].id, day(cycle, 4, '18'));
    assert.equal(result.selectedProposal.id, proposals[preferredIndex].id);
    assert.equal(result.rejectedProposals.length, supplierProfiles.length - 1);

    supplierProfiles.forEach((supplier, index) => {
      const expectedFileName = index % 2 === 0
        ? `boundary-supplier-${index + 1}-final-${cycle}.zip`
        : `boundary-supplier-${index + 1}-submitted-${cycle}.zip`;
      const participantHtml = renderDashboard({
        state: store.snapshot(),
        memberId: supplier.memberId,
        selectedNoticeId: noticeId,
        now: day(cycle, 4, '18'),
      });

      assert.match(participantHtml, new RegExp(expectedFileName));
      supplierProfiles.forEach((otherSupplier, otherIndex) => {
        if (otherSupplier.memberId === supplier.memberId) return;
        assert.doesNotMatch(participantHtml, new RegExp(`boundary-supplier-${otherIndex + 1}-(submitted|final)-${cycle}\\.zip`));
        assert.doesNotMatch(participantHtml, new RegExp(otherSupplier.companyName));
      });
      assert.doesNotMatch(participantHtml, /평가 점수|평가 메모|우선대상자|탈락자|제안서 다운로드/);
    });

    const notified = store.markResultNotificationComplete(operatorId, noticeId, day(cycle, 4, '19'));
    assert.equal(notified.resultNotifiedAt, day(cycle, 4, '19'));

    assert.throws(
      () => store.submitProposalFile(supplierProfiles[0].memberId, noticeId, {
        name: `boundary-supplier-1-after-notification-${cycle}.zip`,
        size: 700000 + cycle,
        type: 'application/zip',
      }, day(cycle, 4, '19')),
      { code: 'NOTICE_NOT_OPEN' }
    );
  }
});
