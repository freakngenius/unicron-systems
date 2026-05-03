'use client';

// LeadDetail — Stream B Gate B2.
//
// Server-fetched project + composer. Match Pathfinder's existing visual
// language (PF_TINTS / Card / Row primitives). The composer is prefilled
// with the most recent email-channel outreach_drafts row; the rep can
// edit subject + body before sending. Send goes through
// POST /api/outreach/send which writes outreach_edits with the diff.

import * as React from 'react';

import { ContactsCard } from '@/components/lead/ContactsCard';
import { CrossPollinationCard } from '@/components/lead/CrossPollinationCard';
import { HubspotSection } from '@/components/lead/HubspotSection';
import { OutreachSection } from '@/components/lead/OutreachSection';
import { ProjectFactsCard } from '@/components/lead/ProjectFactsCard';
import { QuickFactsGrid } from '@/components/lead/QuickFactsGrid';
import { QuickMetricsStrip } from '@/components/lead/QuickMetricsStrip';
import { RationaleCard } from '@/components/lead/RationaleCard';
import { SectionHeading } from '@/components/lead/SectionHeading';
import { SourceChip } from '@/components/lead/SourceChip';
import { SourceRecord } from '@/components/lead/SourceRecord';
import { Timeline } from '@/components/lead/Timeline';
import { VerifierSection } from '@/components/lead/VerifierSection';
import {
  ZedcorRelationshipContext,
  type CrossPollinationMatchRow,
} from '@/components/zedcor/ZedcorRelationshipContext';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { TimelineEvent } from '@/lib/timeline';
import type {
  EmailIntegrationStatus,
  EmailProvider,
  LeadContactRow,
  OutreachDraft,
  OutreachEdit,
  Project,
  ProjectContact,
} from '@/lib/types';

interface ZedcorBranchInfo {
  id: string;
  branch_name: string;
  state: string;
}

interface LeadDetailProps {
  project: Project;
  latestEmailDraft: OutreachDraft | null;
  contacts: ProjectContact[];
  // Demo Polish UX Gate 8C — decision-maker enrichment from
  // pathfinder.lead_contacts (populated by the contact-enricher cron).
  // Distinct from `contacts` (legacy project_contacts surface).
  leadContacts?: LeadContactRow[];
  recentEdits: OutreachEdit[];
  timelineEvents?: TimelineEvent[];
  // Z-F integrator — cross-pollination match rows from
  // pathfinder.lead_cross_pollination, plus the resolved
  // nearest_zedcor_branch row (if any) for the header.
  crossPollMatches?: CrossPollinationMatchRow[];
  zedcorBranch?: ZedcorBranchInfo | null;
  // Demo Polish UX Gate 7A — flag-gated redesign. Default false (existing
  // layout untouched). Set by the page route from
  // process.env.LEAD_DETAIL_REDESIGN === '1'.
  redesignEnabled?: boolean;
  // Demo Polish UX Gate 8C — drives the ContactsCard's "Run now" + the
  // "Request enrichment" empty-state branching. Approximated server-side
  // from project.score >= 50 in the page route.
  isTopFifty?: boolean;
  // Demo Polish UX Gate 8C — admin-only "Run now" affordance. The
  // middleware's basic-auth gate already restricts the page to operators,
  // so this is effectively always true today; passed explicitly so the
  // shape generalizes when per-rep auth lands.
  isAdmin?: boolean;
  // Demo Polish UX Gate 9D — operator's resolved connection. Server-side
  // page route resolves user_connections (with email_integrations
  // fallback) and passes the formatted display + isConnected state.
  // Default: no connection (Send disabled, Settings link surfaced).
  fromDisplay?: string;
  isConnected?: boolean;
}

export function LeadDetail({
  project,
  latestEmailDraft,
  contacts,
  leadContacts = [],
  recentEdits,
  timelineEvents,
  crossPollMatches = [],
  zedcorBranch = null,
  redesignEnabled = false,
  isTopFifty = false,
  isAdmin = false,
  fromDisplay = 'Not connected',
  isConnected = false,
}: LeadDetailProps) {
  // Z-F integrator — header now also surfaces the nearest Zedcor branch +
  // distance and a "Warm intro" badge when we have cross-poll matches.
  const warmIntro = crossPollMatches.length > 0;
  const zedcorLine = zedcorBranch
    ? `${zedcorBranch.branch_name} branch${
        project.zedcor_distance_miles != null
          ? ` · ${project.zedcor_distance_miles.toFixed(1)} mi`
          : ''
      }`
    : null;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: PF_TINTS.bgAlt,
        padding: '24px 24px 48px',
        font: `400 14px ${PF_TINTS.sans}`,
        color: PF_TINTS.ink,
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <h1
          style={{
            margin: 0,
            font: `600 22px ${PF_TINTS.sans}`,
            letterSpacing: '-0.01em',
          }}
        >
          {project.title}
        </h1>
        <div
          className="pf-mono"
          style={{
            font: `500 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.04em',
            marginTop: 4,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>
            {project.source} · score {project.score ?? '—'}
            {project.distance_miles != null
              ? ` · ${project.distance_miles.toFixed(1)} mi`
              : ''}
          </span>
          {zedcorLine && (
            <span
              style={{
                color: PF_TINTS.inkSub,
                paddingLeft: 8,
                borderLeft: `1px solid ${PF_TINTS.ruleHair}`,
              }}
            >
              {zedcorLine}
            </span>
          )}
          {warmIntro && (
            <span
              style={{
                background: hexAlpha('#a3e635', 0.18),
                border: `1px solid ${hexAlpha('#a3e635', 0.6)}`,
                color: PF_TINTS.ink,
                padding: '2px 8px',
                borderRadius: 3,
                font: `600 10px ${PF_TINTS.mono}`,
                letterSpacing: '0.06em',
              }}
            >
              WARM INTRO
            </span>
          )}
        </div>
      </header>

      {redesignEnabled ? (
        <RedesignedBody
          project={project}
          latestEmailDraft={latestEmailDraft}
          contacts={contacts}
          leadContacts={leadContacts}
          recentEdits={recentEdits}
          timelineEvents={timelineEvents}
          crossPollMatches={crossPollMatches}
          zedcorBranch={zedcorBranch}
          isTopFifty={isTopFifty}
          isAdmin={isAdmin}
          fromDisplay={fromDisplay}
          isConnected={isConnected}
        />
      ) : (
        <>
          {/* Demo Polish UX Gate 8C — ContactsCard rendered above the
              two-column grid in flag-off mode. Spec: "append at the
              bottom of existing LeadDetail layout (above Outreach)" —
              the EmailComposer in the left column IS Outreach, so a
              full-width row above the grid sits above Outreach
              semantically without disrupting the existing two-column
              composition. */}
          <div style={{ marginBottom: 16 }}>
            <ContactsCard
              project={project}
              contacts={leadContacts}
              isTopFifty={isTopFifty}
              isAdmin={isAdmin}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
              gap: 16,
              alignItems: 'start',
            }}
          >
            <EmailComposer
              project={project}
              draft={latestEmailDraft}
              contacts={contacts}
            />
            <Sidebar
              project={project}
              contacts={contacts}
              recentEdits={recentEdits}
              crossPollMatches={crossPollMatches}
              zedcorBranch={zedcorBranch}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <Timeline projectId={project.id} initialEvents={timelineEvents} />
          </div>
        </>
      )}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────
// RedesignedBody — single-column v2 composition behind LEAD_DETAIL_REDESIGN
// ────────────────────────────────────────────────────────────────────────
//
// Renders the v2 section order from SPEC - Lead Detail Page v2.md (Gate 9A
// restructure). The header in <LeadDetail /> covers section 1; this body
// renders sections 2-9:
//
//   2. Quick metrics strip   (QuickMetricsStrip — 4-cell)
//   3. Rationale             (RationaleCard — cyan-tinted)
//   4. Project Facts         (QuickFactsGrid + section heading)
//   5. Contacts              (ContactsCard + section heading)
//   6. Relationship Context  (CrossPollinationCard, renamed heading;
//                             card hides itself when 0 matches)
//   7. Outreach              (EmailComposer + RecentSendsBlock; 9C refactor)
//   8. Verifier              (VerifierSection — own heading)
//   9. Source Record         (SourceRecord — curated per-source fields,
//                             no raw JSON dump per spec § 9)
//
// Dropped from v1 redesign per spec § "What's removed":
//   - DecisionBar, RecommendedAction, ProjectStory, ScoreBreakdown,
//     SourceCitations, raw JSON payload exposure

function RedesignedBody({
  project,
  latestEmailDraft,
  contacts,
  leadContacts,
  recentEdits,
  timelineEvents,
  crossPollMatches,
  zedcorBranch,
  isTopFifty,
  isAdmin,
  fromDisplay,
  isConnected,
}: {
  project: Project;
  latestEmailDraft: OutreachDraft | null;
  contacts: ProjectContact[];
  leadContacts: LeadContactRow[];
  recentEdits: OutreachEdit[];
  timelineEvents?: TimelineEvent[];
  crossPollMatches: CrossPollinationMatchRow[];
  zedcorBranch: ZedcorBranchInfo | null;
  isTopFifty: boolean;
  isAdmin: boolean;
  fromDisplay: string;
  isConnected: boolean;
}) {
  // Hook insertion bridge — CrossPollinationCard fires onInsertHook with the
  // selected hook text; we bump nonce and pass the override down to
  // EmailComposer, which uses an effect (watching nonce) to overwrite the
  // body. This keeps EmailComposer's own state intact when no override is
  // pending, while letting the operator click "Open in Outreach with this
  // hook" to seed the composer.
  const [bodyOverride, setBodyOverride] = React.useState<{
    text: string;
    nonce: number;
  } | null>(null);
  const handleInsertHook = React.useCallback((hook: string) => {
    setBodyOverride((prev) => ({ text: hook, nonce: (prev?.nonce ?? 0) + 1 }));
    // Scroll the composer into view so the operator sees the inserted hook.
    if (typeof document !== 'undefined') {
      const el = document.getElementById('lead-email-composer');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Demo Polish UX Gate 8C — ContactsCard "Use as outreach recipient"
  // wires through to the EmailComposer's `to:` override using the same
  // nonce-bump pattern as handleInsertHook above.
  const [recipientOverride, setRecipientOverride] = React.useState<{
    email: string;
    nonce: number;
  } | null>(null);
  const handleSetRecipient = React.useCallback(
    (email: string, _contactName: string) => {
      setRecipientOverride((prev) => ({
        email,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      if (typeof document !== 'undefined') {
        const el = document.getElementById('lead-email-composer');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [],
  );

  // Page-level empty states (per spec § "Empty states (page-level)"):
  // - rejected → muted page state + banner
  // - score present but enriched_at null → "Request enrichment" banner
  // The Gate-9A v2 layout drops DecisionBar / RecommendedAction /
  // ScoreBreakdown, so the rationale-null suppression branch is no longer
  // needed — RationaleCard surfaces "Rationale pending" copy directly.
  const rejected = project.rejection_reason != null;
  const enrichmentMissing =
    project.score != null && project.enriched_at == null && !rejected;

  return (
    <div
      data-testid="lead-detail-redesigned"
      data-rejected={rejected ? 'true' : 'false'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        opacity: rejected ? 0.6 : 1,
      }}
    >
      {rejected && (
        <RejectedBanner reason={project.rejection_reason!} rejectedAt={project.rejected_at ?? null} />
      )}
      {enrichmentMissing && <EnrichmentRequestBanner projectId={project.id} />}

      {/* §2 — Quick metrics strip: VALUE / STAGE / DISTANCE / POSTED */}
      <QuickMetricsStrip project={project} />

      {/* §3 — Rationale (cyan-tinted card with CACHED indicator) */}
      <RationaleCard project={project} />

      {/* §4 — Project Facts (QuickFactsGrid relocated under section heading) */}
      <section data-testid="lead-detail-section-project-facts">
        <SectionHeading title="Project Facts" />
        <QuickFactsGrid project={project} />
      </section>

      {/* §5 — Contacts (ContactsCard relocated under section heading) */}
      <section data-testid="lead-detail-section-contacts">
        <SectionHeading
          title="Contacts"
          sub={leadContacts.length > 0 ? `${leadContacts.length} surfaced` : null}
        />
        <ContactsCard
          project={project}
          contacts={leadContacts}
          isTopFifty={isTopFifty}
          isAdmin={isAdmin}
          onSetRecipient={handleSetRecipient}
        />
      </section>

      {/* §5.5 — HubSpot (Gate 10C). Slots between Contacts and
          Relationship Context per spec. Self-hydrates from
          /api/leads/[id]/hubspot/status. NOTE_BUTTON_ENABLED env flag
          gates the Add Note button — defaults to a disabled stub until
          Kyle upgrades the sandbox tier and engagement scopes are
          granted (Gate 10D). */}
      <HubspotSection
        project={project}
        branchCode={null}
        branchName={zedcorBranch?.branch_name ?? null}
        contactsCount={leadContacts.length}
        noteButtonEnabled={process.env.NEXT_PUBLIC_NOTE_BUTTON_ENABLED === '1'}
      />

      {/* §6 — Relationship Context (renamed from Cross-Pollination; card
          self-hides when 0 matches). Section heading rendered only when
          there are matches so the redesign doesn't show an empty heading. */}
      {crossPollMatches.length > 0 && (
        <section data-testid="lead-detail-section-relationship-context">
          <SectionHeading
            title="Relationship Context"
            sub={`${crossPollMatches.length} match${crossPollMatches.length === 1 ? '' : 'es'}`}
          />
          <CrossPollinationCard
            matches={crossPollMatches}
            targetRegion={zedcorBranch?.state ?? null}
            onInsertHook={handleInsertHook}
          />
        </section>
      )}

      {/* §7 — Outreach (Gate 9C — drafter LLM + new Composer with single
          Send button; 9D adds connection-routed Send. The "From" field is
          a hardcoded stub for 9C; real user_connections lookup ships in
          9D. */}
      <section data-testid="lead-detail-section-outreach">
        <SectionHeading title="Outreach" />
        <OutreachSection
          projectId={project.id}
          leadContacts={leadContacts}
          recentEdits={recentEdits}
          fromDisplay={fromDisplay}
          isConnected={isConnected}
          bodyOverride={bodyOverride}
          recipientOverride={recipientOverride}
        />
      </section>

      {/* §8 — Verifier */}
      <VerifierSection project={project} />

      {/* §9 — Source Record (renamed in Gate 9B from RawPayloadFacts).
          Curated per-source fields only; no raw JSON exposure. Gate 11C
          renders the source as a colored chip in the heading right slot. */}
      <section data-testid="lead-detail-section-source-record">
        <SectionHeading
          title="Source Record"
          rightSlot={<SourceChip source={project.source} />}
        />
        <SourceRecord project={project} />
      </section>

      {/* Activity timeline retained below the spec's 9 sections — provides
          continuous context without competing with the v2 stack above. */}
      <Timeline projectId={project.id} initialEvents={timelineEvents} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Page-level empty-state banners (Gate 7B — spec § "Empty states (page-level)")
// ────────────────────────────────────────────────────────────────────────

function RejectedBanner({
  reason,
  rejectedAt,
}: {
  reason: string;
  rejectedAt: string | null;
}) {
  return (
    <section
      data-testid="lead-detail-rejected-banner"
      style={{
        background: hexAlpha('#dc2626', 0.08),
        border: `1px solid ${hexAlpha('#dc2626', 0.4)}`,
        borderRadius: PF_TINTS.r.md,
        padding: 12,
        font: `500 13px ${PF_TINTS.sans}`,
        color: '#b91c1c',
      }}
    >
      Lead rejected — <strong>{reason}</strong>
      {rejectedAt && (
        <span style={{ font: `400 11px ${PF_TINTS.mono}`, marginLeft: 8 }}>
          ({new Date(rejectedAt).toISOString().slice(0, 10)})
        </span>
      )}
    </section>
  );
}

function EnrichmentRequestBanner({ projectId }: { projectId: string }) {
  // Spec § page-level empty state: surface a "Request enrichment" affordance
  // when the lead has a score but enriched_at is null (top-50 cap excluded
  // it). The /api/enrichment/request endpoint doesn't exist yet (Gate 8
  // territory) — we render the link with an alert handler so the affordance
  // is visible without a false promise.
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      window.alert(
        `Request enrichment for ${projectId} — endpoint pending Gate 8.`,
      );
    }
  };
  return (
    <section
      data-testid="lead-detail-enrichment-banner"
      style={{
        background: hexAlpha('#3b82f6', 0.06),
        border: `1px solid ${hexAlpha('#3b82f6', 0.3)}`,
        borderRadius: PF_TINTS.r.md,
        padding: 10,
        font: `400 12px ${PF_TINTS.sans}`,
        color: PF_TINTS.inkSub,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span>This lead has a score but hasn&apos;t been enriched yet.</span>
      <a
        href="#"
        onClick={onClick}
        data-testid="lead-detail-enrichment-request-link"
        style={{ color: '#3b82f6', font: `500 12px ${PF_TINTS.sans}` }}
      >
        Request enrichment
      </a>
    </section>
  );
}

// Recent sends — extracted for the redesigned layout. The legacy Sidebar
// rendered this as a small SidebarCard. Kept inline here (single-column)
// pending Gate 7B's `Sent history` sub-section under the EmailComposer.
function RecentSendsBlock({ recentEdits }: { recentEdits: OutreachEdit[] }) {
  return (
    <section
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        padding: 14,
      }}
    >
      <h3
        style={{
          margin: '0 0 8px',
          font: `600 11px ${PF_TINTS.sans}`,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkSub,
        }}
      >
        Recent sends
      </h3>
      {recentEdits.slice(0, 5).map((edit) => (
        <div
          key={edit.id}
          style={{
            padding: '6px 0',
            borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
            font: `500 11px ${PF_TINTS.mono}`,
            color: edit.send_error ? '#b91c1c' : PF_TINTS.inkSub,
          }}
          title={edit.sent_subject ?? ''}
        >
          {edit.sent_at
            ? new Date(edit.sent_at).toISOString().slice(0, 16).replace('T', ' ')
            : 'failed'}
          {' · '}
          {edit.provider}
          {' · '}
          {edit.send_error ? edit.send_error : `Δ${edit.edit_distance ?? 0}`}
        </div>
      ))}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// EmailComposer — left column
// ────────────────────────────────────────────────────────────────────────

interface EmailComposerProps {
  project: Project;
  draft: OutreachDraft | null;
  contacts: ProjectContact[];
  /**
   * Optional body-override bridge from the redesigned page (Gate 7B). When
   * `nonce` changes, EmailComposer overwrites its body with `text`. Lets
   * CrossPollinationCard's "Open in Outreach with this hook" feed the
   * composer without making body fully controlled.
   */
  bodyOverride?: { text: string; nonce: number } | null;
  /**
   * Demo Polish UX Gate 8C — recipient-override bridge. Same nonce pattern
   * as bodyOverride. ContactsCard's "Use as outreach recipient" button
   * fires this to set the composer's `to:` field to the selected
   * decision-maker's email.
   */
  recipientOverride?: { email: string; nonce: number } | null;
}

function EmailComposer({
  project,
  draft,
  contacts,
  bodyOverride,
  recipientOverride,
}: EmailComposerProps) {
  const initialSubject = draft?.draft_subject ?? '';
  const initialBody = draft?.draft_body ?? '';
  const initialRecipient = pickRecipientEmail(contacts) ?? '';

  const [actorEmail, setActorEmail] = React.useState<string>('');
  const [provider, setProvider] = React.useState<EmailProvider>('gmail');
  const [recipient, setRecipient] = React.useState<string>(initialRecipient);
  const [subject, setSubject] = React.useState<string>(initialSubject);
  const [body, setBody] = React.useState<string>(initialBody);
  const [statuses, setStatuses] = React.useState<EmailIntegrationStatus[] | null>(null);
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [feedback, setFeedback] = React.useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  // Apply hook-insertion overrides from the redesigned page. Watching
  // `nonce` lets the parent re-fire the same hook text without stale-deps
  // pitfalls. We prepend the hook to whatever's already in the body so
  // operator edits aren't blown away.
  const lastNonce = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!bodyOverride) return;
    if (bodyOverride.nonce === lastNonce.current) return;
    lastNonce.current = bodyOverride.nonce;
    setBody((prev) => (prev ? `${bodyOverride.text}\n\n${prev}` : bodyOverride.text));
  }, [bodyOverride]);

  // Demo Polish UX Gate 8C — recipient override from ContactsCard's
  // "Use as outreach recipient" button. Same nonce pattern as bodyOverride
  // so the parent can re-fire the same address without stale-deps issues.
  const lastRecipientNonce = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!recipientOverride) return;
    if (recipientOverride.nonce === lastRecipientNonce.current) return;
    lastRecipientNonce.current = recipientOverride.nonce;
    setRecipient(recipientOverride.email);
  }, [recipientOverride]);

  // Operator identity isn't carried in basic-auth headers, so v1 caches the
  // rep's email in localStorage. Future iterations swap to Supabase Auth.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = window.localStorage.getItem('pf_actor_email');
    if (cached) setActorEmail(cached);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (actorEmail) window.localStorage.setItem('pf_actor_email', actorEmail);
  }, [actorEmail]);

  // Fetch the rep's email-integration statuses once we know who they are.
  React.useEffect(() => {
    if (!actorEmail) return;
    const params = new URLSearchParams({ actor: actorEmail });
    void fetch(`/pathfinder/api/email/status?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((rows: EmailIntegrationStatus[] | { error: string }) => {
        if (Array.isArray(rows)) setStatuses(rows);
        else setStatuses([]);
      })
      .catch(() => setStatuses([]));
  }, [actorEmail]);

  const activeStatus = statuses?.find(
    (s) => s.provider === provider && !s.disconnected_at,
  );
  const isConnected = Boolean(activeStatus);

  const onSend = async () => {
    if (submitting) return;
    setFeedback(null);
    if (!actorEmail) {
      setFeedback({ kind: 'err', message: 'no operator email — sign in first' });
      return;
    }
    if (!recipient) {
      setFeedback({ kind: 'err', message: 'recipient required' });
      return;
    }
    if (!body.trim()) {
      setFeedback({ kind: 'err', message: 'body required' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/pathfinder/api/outreach/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          actor_email: actorEmail,
          provider,
          recipient_email: recipient,
          draft_subject: draft?.draft_subject ?? null,
          draft_body: draft?.draft_body ?? '',
          sent_subject: subject,
          sent_body: body,
          outreach_draft_id: draft?.id ?? null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setFeedback({ kind: 'ok', message: 'Sent — diff captured to outreach_edits.' });
      } else {
        setFeedback({
          kind: 'err',
          message: json.error ?? `send failed (HTTP ${res.status})`,
        });
      }
    } catch (e) {
      setFeedback({ kind: 'err', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const oauthHref = (() => {
    const params = new URLSearchParams({ provider, actor: actorEmail });
    return `/pathfinder/api/email/oauth/start?${params.toString()}`;
  })();

  return (
    <section
      id="lead-email-composer"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 18,
      }}
    >
      <h2
        style={{
          margin: 0,
          font: `600 14px ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
          marginBottom: 10,
        }}
      >
        Compose email
      </h2>
      {!draft && (
        <p
          style={{
            margin: '0 0 10px',
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkDim,
          }}
        >
          No model draft yet. The Outreach agent drafts after the project is
          verified high-priority. Compose from scratch.
        </p>
      )}

      <Field label="Operator email">
        <input
          type="email"
          value={actorEmail}
          onChange={(e) => setActorEmail(e.target.value)}
          placeholder="rep@zedcor.com"
          style={inputStyle}
        />
      </Field>

      <Field label="Provider">
        <div style={{ display: 'flex', gap: 8 }}>
          <ProviderTab
            value="gmail"
            current={provider}
            onSelect={setProvider}
            label="Gmail"
          />
          <ProviderTab
            value="outlook"
            current={provider}
            onSelect={setProvider}
            label="Outlook"
          />
        </div>
      </Field>

      <Field label="From">
        <div
          style={{
            font: `500 12px ${PF_TINTS.mono}`,
            color: isConnected ? PF_TINTS.ink : PF_TINTS.inkDim,
          }}
        >
          {isConnected ? activeStatus!.account_email : 'not connected'}
          {!isConnected && actorEmail && (
            <a
              href={oauthHref}
              style={{
                marginLeft: 12,
                font: `500 12px ${PF_TINTS.sans}`,
                color: '#9d35ff',
                textDecoration: 'underline',
              }}
            >
              Connect {provider === 'gmail' ? 'Gmail' : 'Outlook'}
            </a>
          )}
        </div>
      </Field>

      <Field label="To">
        <input
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="recipient@example.com"
          style={inputStyle}
        />
      </Field>

      <Field label="Subject">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={initialSubject || 'Subject line'}
          style={inputStyle}
        />
      </Field>

      <Field label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={initialBody || 'Compose body…'}
          rows={10}
          style={{ ...inputStyle, font: `400 13px/1.45 ${PF_TINTS.sans}`, resize: 'vertical' }}
        />
        <div
          style={{
            marginTop: 4,
            font: `500 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
          }}
        >
          {body.length} chars · {wordCount(body)} words
        </div>
      </Field>

      {feedback && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: '8px 12px',
            border: `1px solid ${
              feedback.kind === 'ok' ? hexAlpha('#16a34a', 0.4) : hexAlpha('#dc2626', 0.4)
            }`,
            background:
              feedback.kind === 'ok'
                ? hexAlpha('#16a34a', 0.06)
                : hexAlpha('#dc2626', 0.06),
            color: feedback.kind === 'ok' ? '#15803d' : '#b91c1c',
            borderRadius: PF_TINTS.r.sm,
            font: `500 12px ${PF_TINTS.sans}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onSend}
          disabled={submitting || !isConnected || !actorEmail}
          style={{
            background: '#9d35ff',
            color: '#fff',
            border: '1px solid #9d35ff',
            padding: '8px 18px',
            borderRadius: 3,
            font: `500 13px ${PF_TINTS.sans}`,
            cursor: submitting || !isConnected || !actorEmail ? 'not-allowed' : 'pointer',
            opacity: submitting || !isConnected || !actorEmail ? 0.5 : 1,
          }}
        >
          {submitting ? 'Sending…' : `Send via ${provider === 'gmail' ? 'Gmail' : 'Outlook'}`}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          font: `500 11px ${PF_TINTS.sans}`,
          color: PF_TINTS.inkSub,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: PF_TINTS.bg,
  color: PF_TINTS.ink,
  border: `1px solid ${PF_TINTS.ruleSoft}`,
  borderRadius: 3,
  padding: '8px 10px',
  font: `500 13px ${PF_TINTS.sans}`,
};

function ProviderTab({
  value,
  current,
  onSelect,
  label,
}: {
  value: EmailProvider;
  current: EmailProvider;
  onSelect: (next: EmailProvider) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      style={{
        background: active ? PF_TINTS.ink : PF_TINTS.bg,
        color: active ? PF_TINTS.bg : PF_TINTS.ink,
        border: `1px solid ${active ? PF_TINTS.ink : PF_TINTS.ruleSoft}`,
        padding: '6px 12px',
        borderRadius: 3,
        font: `500 12px ${PF_TINTS.sans}`,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sidebar — right column
// ────────────────────────────────────────────────────────────────────────

interface SidebarProps {
  project: Project;
  contacts: ProjectContact[];
  recentEdits: OutreachEdit[];
  crossPollMatches: CrossPollinationMatchRow[];
  zedcorBranch: ZedcorBranchInfo | null;
}

function Sidebar({
  project,
  contacts,
  recentEdits,
  crossPollMatches,
  zedcorBranch,
}: SidebarProps) {
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ZedcorRelationshipContext
        matches={crossPollMatches}
        targetRegion={zedcorBranch?.state ?? null}
      />
      <ProjectFactsCard project={project} />
      <SidebarCard title="Rationale">
        <div
          style={{
            font: `400 12px/1.5 ${PF_TINTS.sans}`,
            color: PF_TINTS.inkSub,
            whiteSpace: 'pre-wrap',
          }}
        >
          {project.rationale ?? 'Pending Ranker.'}
        </div>
      </SidebarCard>
      <SidebarCard title="Contacts">
        {contacts.length === 0 && (
          <div style={{ font: `400 12px ${PF_TINTS.sans}`, color: PF_TINTS.inkDim }}>
            No contacts surfaced yet.
          </div>
        )}
        {contacts.slice(0, 5).map((c) => (
          <div
            key={c.id}
            style={{
              padding: '6px 0',
              borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
            }}
          >
            <div style={{ font: `600 12px ${PF_TINTS.sans}` }}>{c.full_name}</div>
            <div
              style={{
                font: `400 11px ${PF_TINTS.sans}`,
                color: PF_TINTS.inkDim,
              }}
            >
              {c.title ? `${c.title} · ` : ''}
              {c.email ?? c.phone ?? 'no contact'}
            </div>
          </div>
        ))}
      </SidebarCard>
      <SidebarCard title="Recent sends">
        {recentEdits.length === 0 && (
          <div style={{ font: `400 12px ${PF_TINTS.sans}`, color: PF_TINTS.inkDim }}>
            None yet.
          </div>
        )}
        {recentEdits.slice(0, 5).map((edit) => (
          <div
            key={edit.id}
            style={{
              padding: '6px 0',
              borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
              font: `500 11px ${PF_TINTS.mono}`,
              color: edit.send_error ? '#b91c1c' : PF_TINTS.inkSub,
            }}
            title={edit.sent_subject ?? ''}
          >
            {edit.sent_at
              ? new Date(edit.sent_at).toISOString().slice(0, 16).replace('T', ' ')
              : 'failed'}
            {' · '}
            {edit.provider}
            {' · '}
            {edit.send_error ? edit.send_error : `Δ${edit.edit_distance ?? 0}`}
          </div>
        ))}
      </SidebarCard>
    </aside>
  );
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 14,
      }}
    >
      <h3
        style={{
          margin: '0 0 8px',
          font: `600 12px ${PF_TINTS.sans}`,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkSub,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function pickRecipientEmail(contacts: ProjectContact[]): string | null {
  for (const c of contacts) {
    if (c.email) return c.email;
  }
  return null;
}

function wordCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
