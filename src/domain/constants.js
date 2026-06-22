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
