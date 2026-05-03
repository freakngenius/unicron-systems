// services/briefer/index.ts — Demo Polish UX Gate 13W-A barrel.

export { composeDailyBrief, loadPrefs } from './agent';
export type { ComposeDailyBriefInput, SectionFetchers } from './agent';
export {
  fetchContactsPending,
  fetchFollowUps,
  fetchNewLeads,
  fetchReplies,
  fetchStageChanges,
  renderContactsPending,
  renderFollowUps,
  renderNewLeads,
  renderReplies,
  renderStageChanges,
} from './sections';
export type {
  ContactPendingRow,
  FollowUpRow,
  NewLeadRow,
  ReplyRow,
  StageChangeRow,
} from './sections';
export { buildSubject, formatLocalDate, markdownToHtml } from './render';
