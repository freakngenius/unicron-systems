// lib/chat/context.ts — context helpers for the Intelligence Chat panel.
//
// Three responsibilities:
//   1. buildContextKey(snapshot) → stable string used as the unique key in
//      pathfinder.chat_threads(user_email, context_key).
//   2. buildContextLabel(snapshot, ...) → human-readable string for the
//      chat panel header and the resumed-from pill.
//   3. suggestedPrompts(snapshot, projects) → 3-5 chip strings the
//      ChatInput renders below the input box.
//
// The thread keying decision is locked in PLAN-P0-01-INTELLIGENCE-CHAT.md
// § 0 Q3: per-user with view-aware sub-threads. The key encodes only the
// "thing the user is conversing about" — open project takes precedence
// over branch focus, branch focus over default.

import type { Branch, ChatContextSnapshot, Project } from '@/lib/types';

// ── Context key ────────────────────────────────────────────────────────────

export function buildContextKey(snap: ChatContextSnapshot): string {
  if (snap.openProjectId) return `project:${snap.openProjectId}`;
  if (snap.selectedBranchId) return `branch:${snap.selectedBranchId}`;
  return 'dashboard:default';
}

// ── Context label ──────────────────────────────────────────────────────────

interface LabelLookup {
  projects: Pick<Project, 'id' | 'title'>[];
  branches: Pick<Branch, 'id' | 'name' | 'code'>[];
}

export function buildContextLabel(
  snap: ChatContextSnapshot,
  lookup: LabelLookup,
): string {
  if (snap.openProjectId) {
    const p = lookup.projects.find((x) => x.id === snap.openProjectId);
    const branchSuffix = snap.selectedBranchId
      ? branchLabel(lookup, snap.selectedBranchId, ' · ')
      : '';
    return `${p?.title ?? 'Project'}${branchSuffix}`;
  }
  if (snap.selectedBranchId) {
    const b = lookup.branches.find((x) => x.id === snap.selectedBranchId);
    return b ? `${b.name} branch` : 'Branch';
  }
  return 'All projects';
}

function branchLabel(lookup: LabelLookup, branchId: string, prefix: string): string {
  const b = lookup.branches.find((x) => x.id === branchId);
  if (!b) return '';
  return `${prefix}${b.name}`;
}

// ── Suggested prompts ──────────────────────────────────────────────────────

// Static-by-context for V1. Server-side learning from past usage is a V2
// concern. Each chip maps to one of the seven interaction classes A-G in
// the spec so the test plan can verify class coverage from the chip set
// alone.
export function suggestedPrompts(snap: ChatContextSnapshot): string[] {
  if (snap.openProjectId) {
    return [
      'Tell me more about this prime contractor',
      'Draft outreach for this lead',
      'What other projects has this contractor led?',
      'What is the typical RFP window for a project like this?',
      'Pull the latest news on this project',
    ];
  }
  if (snap.crossPoll) {
    return [
      'Which warm-intro paths look strongest right now?',
      'Show me cross-poll leads in TX with score over 80',
      'Generate a Friday-style brief for me right now',
    ];
  }
  if (snap.selectedBranchId) {
    return [
      'Compare this branch to the rest of the network',
      'Show me this branch top 10 leads as CSV',
      'What is this branch accept rate this week?',
      'Summarize this week pipeline activity for me',
    ];
  }
  return [
    'Show me top leads in TX with score over 80',
    'Which branches have the highest unverified queue right now?',
    'Summarize this week pipeline activity for me',
    'Generate a Friday brief for me right now',
  ];
}

// ── Snapshot construction ──────────────────────────────────────────────────

// Builds the ChatContextSnapshot the dashboard passes to the chat backend.
// Caps filteredProjectIds at 50 to keep the payload small — the server
// re-fetches the actual rows from Supabase by ID before reasoning.
export function buildSnapshot(args: {
  view: ChatContextSnapshot['view'];
  selectedBranchId: string | null;
  openProjectId: string | null;
  sourceFilter: string;
  crossPoll: boolean;
  filteredProjects: Pick<Project, 'id'>[];
  totalProjects: number;
  hiddenProjectIds: string[];
}): ChatContextSnapshot {
  return {
    view: args.view,
    selectedBranchId: args.selectedBranchId,
    openProjectId: args.openProjectId,
    sourceFilter: args.sourceFilter,
    crossPoll: args.crossPoll,
    filteredProjectIds: args.filteredProjects.slice(0, 50).map((p) => p.id),
    totalProjects: args.totalProjects,
    hiddenProjectIds: args.hiddenProjectIds,
    timestamp: new Date().toISOString(),
  };
}
