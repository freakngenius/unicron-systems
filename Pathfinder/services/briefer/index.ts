// services/briefer/index.ts — Demo Polish UX Gate 13W barrel.

export { composeDailyBrief, loadPrefs } from './agent';
export type { ComposeDailyBriefInput, SectionFetchers } from './agent';
export { sendDailyBrief } from './send';
export type { SendDailyBriefInput, SendDailyBriefResult } from './send';
export { runDailyBriefingForAllUsers, shouldSkip } from './cron';
export type {
  RunDailyBriefingInput,
  RunDailyBriefingResult,
  SkipReason,
} from './cron';
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
