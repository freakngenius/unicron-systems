// lib/agents/funder/dealMemo.ts
//
// Funder onboarding Stage 7 — Weekly Deal Memo.
//
// Composes a one-page memo of verified Funder opportunities grouped by
// thesis_area. Each opportunity carries a 3-sentence org snapshot,
// founder bio (when available), thesis-fit rationale (the Sonnet
// rationale from the ranker), and a first-step recommendation (the
// outreach_hook).
//
// Output:
//   - html: print-ready HTML (browser "Save as PDF" produces the deliverable)
//   - plain: plain-text fallback for email clients that strip HTML
//   - subject: email subject line
//
// PDF strategy decision (recorded in REPORT-funder-onboarding.md
// §"Stage 7 PDF strategy"): rather than adding a heavyweight PDF
// library to the project deps for this autonomous run, the memo ships
// as a print-styled HTML page. Operators "Save as PDF" from the
// browser. This is the additive minimum-blast-radius option; a real
// server-side PDF renderer (e.g. @react-pdf/renderer or a headless
// Chromium service) can swap in later without changing the memo
// composer's signature.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 7.

import type { Project } from '@/lib/types';

export interface DealMemoOpportunity {
  project_id: string;
  org_name: string;
  thesis_area: string;
  founder_summary: string | null;
  rationale: string | null;
  first_step: string | null;
  score: number | null;
  source: string;
  geo_hub: string | null;
  compliance_flag: string | null;
}

export interface DealMemo {
  /** ISO date the memo covers (the week ending date). */
  week_ending: string;
  /** Email subject line. */
  subject: string;
  /** Print-ready HTML. */
  html: string;
  /** Plain-text fallback for email clients that strip HTML. */
  plain: string;
  /** Counts surfaced in the memo header. */
  totals: {
    opportunities: number;
    thesis_areas: number;
    biosecurity_flagged: number;
  };
  /** Internal: opportunities grouped by thesis. */
  by_thesis: Record<string, DealMemoOpportunity[]>;
}

export interface DealMemoInput {
  projects: Project[];
  display_name?: string;
  week_ending?: string;
}

function projectToOpportunity(p: Project): DealMemoOpportunity {
  const payload = (p.raw_payload as Record<string, unknown> | null) ?? {};
  const founder_affiliation = typeof payload.founder_affiliation === 'string' ? payload.founder_affiliation : null;
  const thesis = (payload.funder_inferred_thesis ?? payload.thesis_match ?? payload.thesis ?? 'other') as string;
  return {
    project_id: p.id,
    org_name: p.title,
    thesis_area: thesis,
    founder_summary: founder_affiliation,
    rationale: p.rationale,
    first_step: p.outreach_hook,
    score: p.score,
    source: p.source,
    geo_hub: (payload.funder_geo_hub as string) ?? null,
    compliance_flag: (payload.funder_compliance_flag as string) ?? null,
  };
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function thesisLabel(t: string): string {
  return t.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

function renderOpportunityHtml(op: DealMemoOpportunity): string {
  const flag = op.compliance_flag
    ? `<span class="flag">${htmlEscape(op.compliance_flag)}</span>`
    : '';
  const score = op.score != null ? `<span class="score">${op.score}/100</span>` : '';
  const founder = op.founder_summary
    ? `<p class="founder"><strong>Founders:</strong> ${htmlEscape(op.founder_summary)}</p>`
    : '';
  const rationale = op.rationale ? `<p class="rationale">${htmlEscape(op.rationale)}</p>` : '';
  const first_step = op.first_step
    ? `<p class="first-step"><strong>First step:</strong> ${htmlEscape(op.first_step)}</p>`
    : '';
  const hub = op.geo_hub ? `<span class="hub">${htmlEscape(op.geo_hub)}</span>` : '';
  return `<li class="opp">
    <div class="opp-head">
      <h3>${htmlEscape(op.org_name)}</h3>
      <div class="opp-meta">${score} ${hub} ${flag}</div>
    </div>
    ${founder}
    ${rationale}
    ${first_step}
  </li>`;
}

const PRINT_STYLES = `
<style>
  @media print { @page { size: letter; margin: 0.5in; } }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; color: #111; max-width: 720px; margin: 2rem auto; line-height: 1.5; }
  header { border-bottom: 2px solid #111; padding-bottom: 0.5rem; margin-bottom: 1rem; }
  header h1 { margin: 0; font-size: 1.5rem; }
  header p { margin: 0.25rem 0 0; color: #555; font-size: 0.875rem; }
  section.thesis { margin-top: 1.5rem; }
  section.thesis h2 { font-size: 1.1rem; margin: 0 0 0.5rem; color: #111; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  li.opp { padding: 0.75rem 0; border-bottom: 1px solid #eee; page-break-inside: avoid; }
  li.opp:last-child { border-bottom: none; }
  .opp-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .opp-head h3 { margin: 0; font-size: 1rem; }
  .opp-meta { font-size: 0.8rem; color: #555; }
  .score { background: #111; color: #fff; padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600; }
  .hub { background: #eaeaea; padding: 0.1rem 0.4rem; border-radius: 3px; }
  .flag { background: #c4302b; color: #fff; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.75rem; }
  .founder, .rationale, .first-step { margin: 0.4rem 0 0; font-size: 0.875rem; }
  .first-step { color: #111; }
  .rationale { color: #444; }
  footer { margin-top: 2rem; font-size: 0.75rem; color: #888; border-top: 1px solid #ddd; padding-top: 0.5rem; }
</style>
`;

export function composeDealMemo(input: DealMemoInput): DealMemo {
  const display = input.display_name ?? 'Funder';
  const weekEnding = input.week_ending ?? new Date().toISOString().slice(0, 10);

  const opps = input.projects.map(projectToOpportunity);
  const by_thesis: Record<string, DealMemoOpportunity[]> = {};
  for (const op of opps) {
    (by_thesis[op.thesis_area] ??= []).push(op);
  }
  // Sort each thesis bucket by score desc.
  for (const k of Object.keys(by_thesis)) {
    by_thesis[k].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
  // Sort thesis areas by name for stable output.
  const orderedThesis = Object.keys(by_thesis).sort();

  const totals = {
    opportunities: opps.length,
    thesis_areas: orderedThesis.length,
    biosecurity_flagged: opps.filter((o) => o.compliance_flag === 'biosecurity-review').length,
  };

  const subject = `${display} Weekly Deal Memo — ${totals.opportunities} opportunities · ${totals.thesis_areas} thesis areas (week of ${weekEnding})`;

  const htmlSections = orderedThesis
    .map(
      (t) => `<section class="thesis">
    <h2>${htmlEscape(thesisLabel(t))} (${by_thesis[t].length})</h2>
    <ul>${by_thesis[t].map(renderOpportunityHtml).join('')}</ul>
  </section>`,
    )
    .join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(subject)}</title>${PRINT_STYLES}</head><body>
  <header>
    <h1>${htmlEscape(display)} Weekly Deal Memo</h1>
    <p>Week ending ${htmlEscape(weekEnding)} · ${totals.opportunities} verified opportunities across ${totals.thesis_areas} thesis areas${totals.biosecurity_flagged > 0 ? ` · ${totals.biosecurity_flagged} flagged for biosecurity review` : ''}</p>
  </header>
  ${htmlSections}
  <footer>Generated by Pathfinder. Print to PDF from your browser to save a copy. Biosecurity-flagged opportunities are not auto-drafted for outreach — review them manually.</footer>
  </body></html>`;

  // Plain text rendering for email clients that strip HTML.
  const plainSections = orderedThesis.map((t) => {
    const lines = [`\n=== ${thesisLabel(t).toUpperCase()} (${by_thesis[t].length}) ===\n`];
    for (const op of by_thesis[t]) {
      lines.push(`• ${op.org_name} ${op.score != null ? `(${op.score}/100)` : ''}${op.geo_hub ? ` [${op.geo_hub}]` : ''}${op.compliance_flag ? ` [${op.compliance_flag}]` : ''}`);
      if (op.founder_summary) lines.push(`  Founders: ${op.founder_summary}`);
      if (op.rationale) lines.push(`  ${op.rationale}`);
      if (op.first_step) lines.push(`  First step: ${op.first_step}`);
      lines.push('');
    }
    return lines.join('\n');
  });

  const plain = `${display} Weekly Deal Memo
Week ending ${weekEnding}
${totals.opportunities} verified opportunities · ${totals.thesis_areas} thesis areas${totals.biosecurity_flagged > 0 ? ` · ${totals.biosecurity_flagged} flagged for biosecurity review` : ''}
${plainSections.join('\n')}
---
Generated by Pathfinder. Biosecurity-flagged opportunities are not auto-drafted for outreach.`;

  return { week_ending: weekEnding, subject, html, plain, totals, by_thesis };
}
