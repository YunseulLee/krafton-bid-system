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
