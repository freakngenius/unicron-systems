// Z-D Wave 3 (#17) — Rejected pile page.
//
// TUESDAY DEMO PLAN.md item 7: surface the projects the verifier rejected
// or low-scored, grouped by reason category so reviewers see the "we
// considered these and dropped them" pile rather than only the leads we
// recommend.
//
// Server component — fetches verified=true AND score < 60 directly via
// the admin client, derives a reason category from rationale +
// verifier_notes, and renders 3 representative examples per category.
//
// Mounted under `/pathfinder/rejected` thanks to the project's basePath.
// No client interactivity — this is a static review surface for the demo.

import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Pathfinder · Rejected pile' };

interface RejectedRow {
  id: string;
  title: string | null;
  rationale: string | null;
  verifier_notes: string | null;
  score: number | null;
  source: string | null;
  project_value: number | null;
  ingested_at: string;
  // Demo Polish P1 — explicit rejection_reason set by the ingestor (Layer A
  // out_of_country) and the ranker (Layer C no_branch_coverage). When set,
  // it takes precedence over text-based bucket inference.
  rejection_reason?: string | null;
  country?: string | null;
}

interface ReasonGroup {
  /** Stable key — category bucket name, lowercased. */
  key: string;
  /** Operator-facing label rendered in the UI. */
  label: string;
  /** Total rows in the bucket. */
  count: number;
  /** Up to 5 representative rows (showing 3+ per the brief). */
  examples: RejectedRow[];
}

/** Bucket a row by inspecting its rationale + verifier_notes. The buckets
 * are tuned against the live distribution surfaced by:
 *   select rationale, count(*) from pathfinder.projects
 *     where verified=true and score < 60 group by 1 order by 2 desc;
 * (Run 2026-05-02 — top buckets: classifier-filter, out-of-coverage,
 * scope mismatch, owner-not-enriched.) */
function categorize(row: RejectedRow): { key: string; label: string } {
  // Demo Polish P1 — when an explicit rejection_reason is present, it
  // wins. New buckets surface automatically: out_of_country (ingest
  // filter) and no_branch_coverage (ranker distance gate).
  if (row.rejection_reason === 'out_of_country') {
    const country = row.country ? ` (${row.country})` : '';
    return { key: 'out-of-country', label: `Out of country${country}` };
  }
  if (row.rejection_reason === 'no_branch_coverage') {
    return { key: 'no-branch-coverage', label: 'No Zedcor branch within range' };
  }

  const text = `${row.rationale ?? ''}\n${row.verifier_notes ?? ''}`.toLowerCase();

  if (text.includes('filtered as non-opportunity') || text.includes('classifier')) {
    return { key: 'classifier-filter', label: 'Filtered as non-opportunity by classifier' };
  }
  if (
    text.includes('outside') &&
    (text.includes('coverage radius') || text.includes('branch'))
  ) {
    return { key: 'out-of-coverage', label: 'Outside Zedcor branch coverage radius' };
  }
  if (text.includes('owner not yet enriched')) {
    return { key: 'owner-not-enriched', label: 'Owner not yet enriched (verifier rewrite)' };
  }
  if (text.includes('not in customer table')) {
    return { key: 'unknown-customer', label: 'Customer not in Zedcor table' };
  }
  if (
    text.includes('mismatch') ||
    text.includes('score drift') ||
    text.includes('out of tolerance')
  ) {
    return { key: 'verifier-mismatch', label: 'Verifier check failed (branch / score mismatch)' };
  }
  if (
    text.includes('not a construction') ||
    text.includes('equipment-supply') ||
    text.includes('scope mismatch') ||
    text.includes('manufacturing')
  ) {
    return { key: 'scope-mismatch', label: 'Scope mismatch (not a construction / site-security project)' };
  }
  if (text.includes('null-coordinate')) {
    return { key: 'null-coordinate', label: 'Null-coordinate project (geographic checks skipped)' };
  }
  return { key: 'low-score-other', label: 'Other low-score reason' };
}

async function fetchRejected(): Promise<{
  groups: ReasonGroup[];
  total: number;
  loadError: string | null;
}> {
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (err) {
    return { groups: [], total: 0, loadError: (err as Error).message };
  }

  // Demo Polish P1 — pull two pools and union them:
  //   (a) verified=true AND score<60 — the original "evaluated and dropped" set
  //   (b) rejection_reason IS NOT NULL — the new out_of_country /
  //       no_branch_coverage buckets that may not be verified=true.
  // The union is computed in-memory by id so a row in both pools shows once.
  const [verifiedRes, rejectedRes] = await Promise.all([
    admin
      .from('projects')
      .select(
        'id, title, rationale, verifier_notes, score, source, project_value, ingested_at, rejection_reason, country',
      )
      .eq('verified', true)
      .lt('score', 60)
      .order('score', { ascending: false, nullsFirst: false })
      .order('ingested_at', { ascending: false })
      .limit(500),
    admin
      .from('projects')
      .select(
        'id, title, rationale, verifier_notes, score, source, project_value, ingested_at, rejection_reason, country',
      )
      .not('rejection_reason', 'is', null)
      .order('rejected_at', { ascending: false, nullsFirst: false })
      .order('ingested_at', { ascending: false })
      .limit(500),
  ]);
  const error = verifiedRes.error ?? rejectedRes.error;
  const data = error
    ? null
    : Array.from(
        new Map(
          [...(verifiedRes.data ?? []), ...(rejectedRes.data ?? [])].map((r) => [
            (r as RejectedRow).id,
            r,
          ]),
        ).values(),
      );

  if (error) {
    return { groups: [], total: 0, loadError: error.message };
  }

  const rows = (data ?? []) as RejectedRow[];
  const buckets = new Map<string, ReasonGroup>();
  for (const row of rows) {
    const cat = categorize(row);
    const existing = buckets.get(cat.key);
    if (existing) {
      existing.count += 1;
      if (existing.examples.length < 5) existing.examples.push(row);
    } else {
      buckets.set(cat.key, {
        key: cat.key,
        label: cat.label,
        count: 1,
        examples: [row],
      });
    }
  }

  const groups = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  return { groups, total: rows.length, loadError: null };
}

function formatValue(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const PAL = {
  bg: '#0d0d0e',
  card: '#16181c',
  rule: 'rgba(255,255,255,0.08)',
  ink: '#e6e9ef',
  inkDim: '#9aa0a6',
  inkFaint: '#6b7280',
  warn: '#f59e0b',
  bad: '#ef4444',
  ok: '#22c55e',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
  sans: 'var(--font-inter), system-ui, sans-serif',
} as const;

export default async function RejectedPilePage() {
  const { groups, total, loadError } = await fetchRejected();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: PAL.bg,
        color: PAL.ink,
        fontFamily: PAL.sans,
        padding: '32px 28px 48px',
      }}
    >
      <header
        style={{
          maxWidth: 1100,
          margin: '0 auto 24px',
          paddingBottom: 16,
          borderBottom: `1px solid ${PAL.rule}`,
        }}
      >
        <h1
          style={{
            fontFamily: PAL.mono,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: PAL.inkDim,
            margin: 0,
          }}
        >
          Pathfinder · Rejected pile
        </h1>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 24,
            lineHeight: 1.3,
            fontWeight: 500,
            color: PAL.ink,
          }}
        >
          The opportunities we evaluated and didn&apos;t recommend.{' '}
          <span style={{ color: PAL.inkDim, fontWeight: 400 }}>
            {total.toLocaleString()} verified projects with score &lt; 60, grouped by reason.
          </span>
        </p>
      </header>

      {loadError && (
        <section
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: 16,
            border: `1px solid ${PAL.bad}`,
            borderRadius: 8,
            color: PAL.bad,
            fontFamily: PAL.mono,
          }}
        >
          Failed to load rejected pile: {loadError}
        </section>
      )}

      {!loadError && groups.length === 0 && (
        <section
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: 24,
            border: `1px dashed ${PAL.rule}`,
            borderRadius: 8,
            color: PAL.inkDim,
            fontFamily: PAL.mono,
            textAlign: 'center',
          }}
        >
          No rejected projects in the corpus yet.
        </section>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 20 }}>
        {groups.map((group) => (
          <section
            key={group.key}
            style={{
              background: PAL.card,
              border: `1px solid ${PAL.rule}`,
              borderRadius: 10,
              padding: '18px 20px',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                marginBottom: 12,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  color: PAL.ink,
                }}
              >
                {group.label}
              </h2>
              <span
                style={{
                  fontFamily: PAL.mono,
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  color: PAL.inkDim,
                  textTransform: 'uppercase',
                }}
              >
                {group.count.toLocaleString()} project{group.count === 1 ? '' : 's'}
              </span>
            </header>

            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gap: 10,
              }}
            >
              {group.examples.map((p) => (
                <li
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr auto',
                    gap: 14,
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${PAL.rule}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: PAL.mono,
                      fontSize: 13,
                      color: p.score != null && p.score >= 40 ? PAL.warn : PAL.bad,
                      fontWeight: 600,
                    }}
                  >
                    {p.score == null ? '—' : Math.round(p.score)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: PAL.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.title ?? '(untitled)'}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: PAL.inkFaint,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.verifier_notes
                        ?? (p.rationale && p.rationale.length < 200 ? p.rationale : '—')}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: PAL.mono,
                      fontSize: 12,
                      color: PAL.inkDim,
                    }}
                  >
                    {formatValue(p.project_value)}
                    <span style={{ color: PAL.inkFaint, marginLeft: 8 }}>
                      {p.source ?? '—'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
