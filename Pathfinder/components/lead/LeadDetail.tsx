'use client';

// LeadDetail — Stream B Gate B2.
//
// Server-fetched project + composer. Match Pathfinder's existing visual
// language (PF_TINTS / Card / Row primitives). The composer is prefilled
// with the most recent email-channel outreach_drafts row; the rep can
// edit subject + body before sending. Send goes through
// POST /api/outreach/send which writes outreach_edits with the diff.

import * as React from 'react';

import { ProjectFactsCard } from '@/components/lead/ProjectFactsCard';
import { Timeline } from '@/components/lead/Timeline';
import {
  ZedcorRelationshipContext,
  type CrossPollinationMatchRow,
} from '@/components/zedcor/ZedcorRelationshipContext';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { TimelineEvent } from '@/lib/timeline';
import type {
  EmailIntegrationStatus,
  EmailProvider,
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
  recentEdits: OutreachEdit[];
  timelineEvents?: TimelineEvent[];
  // Z-F integrator — cross-pollination match rows from
  // pathfinder.lead_cross_pollination, plus the resolved
  // nearest_zedcor_branch row (if any) for the header.
  crossPollMatches?: CrossPollinationMatchRow[];
  zedcorBranch?: ZedcorBranchInfo | null;
}

export function LeadDetail({
  project,
  latestEmailDraft,
  contacts,
  recentEdits,
  timelineEvents,
  crossPollMatches = [],
  zedcorBranch = null,
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
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────
// EmailComposer — left column
// ────────────────────────────────────────────────────────────────────────

interface EmailComposerProps {
  project: Project;
  draft: OutreachDraft | null;
  contacts: ProjectContact[];
}

function EmailComposer({ project, draft, contacts }: EmailComposerProps) {
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
