// lib/chat/lead-chat-context.ts
//
// Build the Sonar system prompt for the Internal Lead Chat Agent. The
// agent grounds answers in REAL Internal data (CompanyLeadView projection
// of a pathfinder.projects row, plus the six qualitative signals from
// lib/catalog/internalSignals). The user's question is the Sonar query
// slot; web research and citations come for free from Sonar.
//
// Plan: Pathfinder/docs/PLAN-stream-h.md.

import type { Project } from '@/lib/types';
import {
  projectToCompanyLeadView,
  type CompanyLeadView,
} from '@/lib/agents/internal/companyLeadView';
import {
  extractInternalSignals,
  formatWeightPercent,
  type InternalSignal,
} from '@/lib/catalog/internalSignals';
import type { LeadChatMessageRow } from './lead-chat-types';

export interface BuildSystemPromptArgs {
  orgName: string;
  scopeLabel: string;
  focal: { project: Project; view: CompanyLeadView; signals: InternalSignal[] } | null;
  list: Array<{ view: CompanyLeadView; signals: InternalSignal[] }>;
  history: Array<Pick<LeadChatMessageRow, 'role' | 'content'>>;
}

const HISTORY_TURN_LIMIT = 12;

/**
 * Build a CompanyLeadView + signals bundle for a Project row.
 */
export function projectBundle(p: Project): {
  view: CompanyLeadView;
  signals: InternalSignal[];
} {
  const view = projectToCompanyLeadView(p);
  const signals = extractInternalSignals(view, (p.raw_payload as Record<string, unknown>) ?? null);
  return { view, signals };
}

function formatFocal(view: CompanyLeadView, signals: InternalSignal[]): string {
  const lines: string[] = [];
  lines.push(`COMPANY: ${view.company_name}`);
  if (view.score !== null) lines.push(`SCORE: ${view.score} / 100`);
  if (view.verified !== null) lines.push(`VERIFIED: ${view.verified ? 'yes' : 'no'}`);
  if (view.service_category) lines.push(`SERVICE CATEGORY: ${view.service_category}`);
  if (view.sales_motion) lines.push(`SALES MOTION: ${view.sales_motion}`);
  if (view.footprint) lines.push(`OPERATING FOOTPRINT: ${view.footprint}`);
  if (view.hq_location) lines.push(`HEADQUARTERS: ${view.hq_location}`);
  if (view.federal_registration) lines.push(`FEDERAL REGISTRATION: ${view.federal_registration}`);
  if (view.associations.length > 0) lines.push(`TRADE ASSOCIATIONS: ${view.associations.join(', ')}`);
  if (view.employee_count !== null) lines.push(`EMPLOYEE COUNT: ${view.employee_count}`);
  if (view.source) lines.push(`SOURCE: ${view.source}`);
  if (view.posted_date) lines.push(`POSTED DATE: ${view.posted_date}`);
  if (view.warm_intro) lines.push(`WARM INTRO: ${view.warm_intro}`);
  if (view.first_step) lines.push(`RECOMMENDED FIRST STEP: ${view.first_step}`);
  if (view.rationale) lines.push(`RATIONALE: ${view.rationale}`);
  if (view.brief) lines.push(`BRIEF: ${view.brief}`);
  if (view.website) lines.push(`WEBSITE: ${view.website}`);
  if (view.linkedin) lines.push(`LINKEDIN: ${view.linkedin}`);
  if (view.contacts.length > 0) {
    const head = view.contacts.slice(0, 5).map((c) => {
      const bits: string[] = [c.name];
      if (c.title) bits.push(c.title);
      if (c.email) bits.push(c.email);
      return bits.join(', ');
    });
    lines.push(`CONTACTS (top ${head.length}): ${head.join(' | ')}`);
  }
  lines.push('');
  lines.push('SIX WEIGHTED SIGNALS (qualitative evidence, no fabricated point contributions):');
  for (const s of signals) {
    const ev = s.evidence ? s.evidence : 'no observable evidence';
    lines.push(`- ${s.label} (weight ${formatWeightPercent(s.weight)}): ${ev}`);
  }
  return lines.join('\n');
}

function formatListItem(view: CompanyLeadView): string {
  const parts: string[] = [];
  parts.push(view.company_name);
  if (view.score !== null) parts.push(`score ${view.score}`);
  if (view.service_category) parts.push(view.service_category);
  if (view.hq_location) parts.push(view.hq_location);
  if (view.federal_registration && view.federal_registration.toLowerCase() !== 'none') {
    parts.push(view.federal_registration);
  }
  return parts.join(' | ');
}

/**
 * Build the Sonar system prompt for an Internal chat turn.
 *
 * Style rules mirror the existing Pathfinder chat for consistency:
 *  - No em-dashes or en-dashes.
 *  - Restrained and specific. Cite real values, never fabricate.
 *  - When asked about a company's score or signals, name the architecture
 *    weight and the real stored evidence (never a fabricated numeric
 *    breakdown).
 *  - When external context is needed (recent news, leadership, hiring),
 *    use web search and cite sources.
 */
export function buildLeadChatSystemPrompt(args: BuildSystemPromptArgs): string {
  const lines: string[] = [];
  lines.push(
    `You are the Internal Lead Chat Agent for ${args.orgName} on Pathfinder. You help a salesperson reason about the Internal companies dataset and draft outreach. Be specific, restrained, plain spoken.`,
  );
  lines.push('');
  lines.push('Style rules, non-negotiable:');
  lines.push('- No em-dashes or en-dashes. Use commas, periods, or the word "to".');
  lines.push('- Cite real values from the PATHFINDER INTERNAL CONTEXT block below. Never fabricate a number.');
  lines.push('- When asked why a company scored what it did, list the six weighted signals with their architecture weights and the real stored evidence. Do not invent numeric point contributions; the ranker does not persist them.');
  lines.push('- When the question needs external context, use web search and cite sources at the end.');
  lines.push('- When drafting outreach, ground every claim in the company\'s real fields. Keep it short and human.');
  lines.push('- If you do not have enough data to answer, say so plainly.');
  lines.push('');
  lines.push(`SCOPE: ${args.scopeLabel}`);
  lines.push('');
  lines.push('PATHFINDER INTERNAL CONTEXT');
  if (args.focal) {
    lines.push('-- FOCAL COMPANY --');
    lines.push(formatFocal(args.focal.view, args.focal.signals));
  }
  if (args.list.length > 0) {
    lines.push('');
    lines.push(`-- COMPANIES IN SCOPE (top ${args.list.length}) --`);
    for (const item of args.list) {
      lines.push(`- ${formatListItem(item.view)}`);
    }
  }
  if (!args.focal && args.list.length === 0) {
    lines.push('(no specific company rows attached; answer at the org level.)');
  }

  if (args.history.length > 0) {
    const compact = args.history.slice(-HISTORY_TURN_LIMIT).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 1200),
    }));
    lines.push('');
    lines.push(`PRIOR TURNS: ${JSON.stringify(compact)}`);
  }

  return lines.join('\n');
}
