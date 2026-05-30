'use client';

// components/catalog/modules/OutreachComposer.tsx, Stream C Detail surface.
//
// Slot: detail.outreach (claim). Three drafts (email, LinkedIn, internal
// HubSpot note) synthesized from architecture.outreach (persona, tone,
// value_prop) plus the company first_step and warm_intro. One-click copy
// each.
//
// Send action: hard-gated on the resend integration at the catalog level.
// At runtime, posts to the existing per-project send endpoint
// /api/leads/[projectId]/outreach/send. When resend is absent from
// architecture.integrations the catalog renderer would have already
// fallen the slot to floor; the disabled affordance below also
// double-checks at render time so this module renders honestly if it
// ever reaches a no-resend org.
//
// Affordances (hubspot-sync etc) render in the action row beneath the
// drafts.

import * as React from 'react';

import {
  Card,
  EmptyState,
  SectionHeader,
  color,
  font,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  space,
} from '@/components/design';
import type { ModuleComponentProps, ResolvedAffordance } from '@/lib/catalog/types';
import { orgPaths } from '@/lib/nav/orgPath';

import { useCompanyDetail } from '../CompanyDetailContext';

void React;

interface DraftView {
  channel: 'email' | 'linkedin' | 'hubspot_note';
  label: string;
  subject?: string;
  body: string;
}

export default function OutreachComposer(props: ModuleComponentProps): React.ReactElement {
  const { lead, project, architecture, org, slotMode, slotReason } = useCompanyDetail();
  const drafts = synthesizeDrafts({
    lead,
    persona: architecture.outreach?.persona ?? '',
    tone: architecture.outreach?.tone ?? '',
    valueProp: architecture.outreach?.value_prop ?? '',
    orgName: org.name,
  });
  const resendPresent = (architecture.integrations ?? []).includes('resend');
  const inactiveSoft = slotMode['detail.outreach'] === 'inactive';
  const inactiveReason = slotReason['detail.outreach'] ?? '';

  return (
    <Card data-stream-c-module="outreach-composer">
      <SectionHeader
        eyebrow="Outreach"
        title="Three drafts"
        subtitle={
          inactiveSoft
            ? `Composing from org config (cached drafts pending: ${inactiveReason}).`
            : 'Composed from this org’s persona, tone, and value prop.'
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
        {drafts.map((d) => (
          <DraftCard key={d.channel} draft={d} />
        ))}
      </div>
      <ActionRow
        projectId={project.id}
        resendPresent={resendPresent}
        affordances={props.affordances}
        parentModuleProps={props}
        orgDashboardHref={orgPaths.dashboard(org.slug)}
        emailDraft={drafts.find((d) => d.channel === 'email') ?? null}
      />
    </Card>
  );
}

function DraftCard({ draft }: { draft: DraftView }): React.ReactElement {
  const [copied, setCopied] = React.useState<'idle' | 'ok' | 'err'>('idle');
  const onCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopied('err');
      return;
    }
    try {
      const text = draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body;
      await navigator.clipboard.writeText(text);
      setCopied('ok');
      window.setTimeout(() => setCopied('idle'), 1800);
    } catch {
      setCopied('err');
    }
  };
  const buttonLabel = copied === 'ok' ? 'Copied' : copied === 'err' ? 'Copy failed' : 'Copy';

  return (
    <div
      data-outreach-draft={draft.channel}
      style={{
        background: color.bgSubtle,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space.lg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: space.md,
          marginBottom: space.sm,
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: fontSize.eyebrow,
            letterSpacing: letterSpacing.wider,
            color: color.textMuted,
            textTransform: 'uppercase',
          }}
        >
          {draft.label}
        </div>
        <button
          type="button"
          onClick={onCopy}
          data-outreach-copy-button
          style={{
            background: copied === 'ok' ? color.accentSoft : color.bg,
            color: copied === 'err' ? color.danger : color.accent,
            border: `1px solid ${color.border}`,
            padding: `4px 12px`,
            borderRadius: radius.sm,
            fontFamily: font.sans,
            fontSize: fontSize.micro,
            fontWeight: fontWeight.medium,
            cursor: 'pointer',
          }}
        >
          {buttonLabel}
        </button>
      </div>
      {draft.subject ? (
        <div
          style={{
            color: color.text,
            fontFamily: font.sans,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.semi,
            marginBottom: space.xs,
          }}
        >
          {draft.subject}
        </div>
      ) : null}
      <pre
        style={{
          margin: 0,
          color: color.text,
          fontFamily: font.sans,
          fontSize: fontSize.sm,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {draft.body}
      </pre>
    </div>
  );
}

function ActionRow({
  projectId,
  resendPresent,
  affordances,
  parentModuleProps,
  orgDashboardHref,
  emailDraft,
}: {
  projectId: string;
  resendPresent: boolean;
  affordances: readonly ResolvedAffordance[];
  parentModuleProps: ModuleComponentProps;
  orgDashboardHref: string;
  emailDraft: DraftView | null;
}): React.ReactElement {
  const [sending, setSending] = React.useState<'idle' | 'pending' | 'ok' | 'err'>('idle');
  const [errMessage, setErrMessage] = React.useState<string>('');

  const onSend = async () => {
    if (!resendPresent) return;
    if (!emailDraft) {
      setSending('err');
      setErrMessage('no email draft to send');
      return;
    }
    setSending('pending');
    setErrMessage('');
    try {
      const res = await fetch(`/pathfinder/api/leads/${encodeURIComponent(projectId)}/outreach/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: '',
          subject: emailDraft.subject ?? '',
          body: emailDraft.body,
        }),
      });
      if (res.ok) {
        setSending('ok');
      } else {
        let detail = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string; message?: string };
          if (j.error) detail = `${j.error}${j.message ? `: ${j.message}` : ''}`;
        } catch {
          /* swallow parse */
        }
        setSending('err');
        setErrMessage(detail);
      }
    } catch (e) {
      setSending('err');
      setErrMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const sendLabel =
    sending === 'pending' ? 'Sending…' : sending === 'ok' ? 'Sent' : sending === 'err' ? 'Retry send' : 'Send email';
  const sendDisabled = !resendPresent || sending === 'pending';

  return (
    <div
      data-outreach-actions
      style={{
        marginTop: space.lg,
        paddingTop: space.md,
        borderTop: `1px solid ${color.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: space.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          data-outreach-send-button
          data-outreach-send-state={resendPresent ? 'enabled' : 'gated'}
          style={{
            background: sendDisabled && !resendPresent ? color.bgSubtle : color.accent,
            color: sendDisabled && !resendPresent ? color.textDim : color.bg,
            border: `1px solid ${sendDisabled && !resendPresent ? color.border : color.accent}`,
            padding: `8px 16px`,
            borderRadius: radius.sm,
            fontFamily: font.sans,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.semi,
            cursor: sendDisabled ? 'not-allowed' : 'pointer',
            opacity: sendDisabled && sending === 'pending' ? 0.6 : 1,
          }}
        >
          {sendLabel}
        </button>
        {!resendPresent ? (
          <span
            data-outreach-send-gate-reason
            style={{
              color: color.textMuted,
              fontFamily: font.sans,
              fontSize: fontSize.micro,
            }}
          >
            Send disabled: Resend integration not connected for this org.
          </span>
        ) : null}
        {sending === 'err' && errMessage ? (
          <span
            data-outreach-send-error
            style={{
              color: color.danger,
              fontFamily: font.sans,
              fontSize: fontSize.micro,
            }}
          >
            {errMessage}
          </span>
        ) : null}
        {sending === 'ok' ? (
          <span
            style={{
              color: color.scoreMid,
              fontFamily: font.sans,
              fontSize: fontSize.micro,
            }}
          >
            Sent. Diff captured to outreach_edits.
          </span>
        ) : null}
      </div>
      <div data-outreach-affordances style={{ display: 'flex', gap: space.sm }}>
        {affordances.map((aff) => {
          const A = aff.Component;
          return (
            <A
              key={aff.id}
              org={parentModuleProps.org}
              architecture={parentModuleProps.architecture}
              config={aff.config}
              affordances={[]}
            />
          );
        })}
      </div>
      <a
        href={orgDashboardHref}
        data-outreach-back-link
        style={{
          color: color.textMuted,
          fontFamily: font.mono,
          fontSize: fontSize.micro,
          letterSpacing: letterSpacing.wider,
          textTransform: 'uppercase',
          textDecoration: 'none',
          alignSelf: 'center',
        }}
      >
        ‹ Back to feed
      </a>
    </div>
  );
}

interface SynthesizeArgs {
  lead: ReturnType<typeof useCompanyDetail>['lead'];
  persona: string;
  tone: string;
  valueProp: string;
  orgName: string;
}

function synthesizeDrafts({ lead, persona, tone, valueProp, orgName }: SynthesizeArgs): DraftView[] {
  const company = lead.company_name;
  const firstStep = lead.first_step ?? `share Pathfinder's pre-ranked list of construction-vertical leads`;
  const warmIntro = lead.warm_intro ?? '';
  const motion = lead.sales_motion ?? '';
  const footprint = lead.footprint ?? lead.hq_location ?? '';

  const emailSubject = `Quick note from ${orgName || 'Unicron'} on ${company}'s outbound`;
  const emailBody = [
    `Hi ${firstNameOrTeam(company)},`,
    '',
    `I run new business at Unicron Systems. We built Pathfinder to do exactly the kind of prospecting your team is doing into the construction vertical: ${valueProp || 'a ranked, outreach-ready pipeline of qualified leads every morning'}.`,
    '',
    `Why I am reaching out to ${company} specifically: ${observation(lead)}`,
    '',
    `Worth fifteen minutes to compare notes? I can ${firstStep}.`,
    '',
    `${signOff(persona, tone)}`,
  ]
    .filter((s) => s !== null)
    .join('\n');

  const linkedInBody = [
    `${company} keeps popping up in our scoring${footprint ? ` (${footprint})` : ''}. ${observation(lead)}`,
    '',
    `Sending a ranked list of construction-vertical prospects every morning is what we built Pathfinder to do. Open to fifteen minutes?`,
  ].join('\n');

  const hubspotNote = [
    `${company} | score ${lead.score ?? '?'} | source ${lead.source ?? 'unknown'}.`,
    motion ? `Sales motion: ${motion}.` : null,
    lead.federal_registration ? `Federal: ${lead.federal_registration}.` : null,
    warmIntro ? `Warm intro: ${warmIntro}.` : null,
    `First step: ${firstStep}.`,
  ]
    .filter((s): s is string => !!s)
    .join(' ');

  return [
    { channel: 'email', label: 'Email', subject: emailSubject, body: emailBody },
    { channel: 'linkedin', label: 'LinkedIn message', body: linkedInBody },
    { channel: 'hubspot_note', label: 'Internal HubSpot note', body: hubspotNote },
  ];
}

function firstNameOrTeam(company: string): string {
  // Heuristic: we do not have a per-contact handle here, so address the company.
  return `${company} team`;
}

function observation(lead: ReturnType<typeof useCompanyDetail>['lead']): string {
  const parts: string[] = [];
  if (lead.sales_motion && lead.sales_motion.toLowerCase().includes('outbound')) {
    parts.push('your team is actively outbounding into the same vertical we cover');
  } else if (lead.sales_motion) {
    parts.push(`your stated sales motion is ${lead.sales_motion.toLowerCase()}`);
  }
  if (lead.footprint) parts.push(`you operate across ${lead.footprint}`);
  if (lead.federal_registration && lead.federal_registration.toLowerCase() !== 'none') {
    parts.push(`federal registration shows ${lead.federal_registration.toLowerCase()}`);
  }
  if (lead.associations.length > 0) {
    parts.push(`you are active in ${lead.associations.slice(0, 2).join(' and ')}`);
  }
  if (parts.length === 0) return `you fit the construction-vertical profile we prioritize`;
  return parts.join(', ');
}

function signOff(persona: string, tone: string): string {
  const direct = tone.toLowerCase().includes('direct') || tone.toLowerCase().includes('peer');
  const lead = persona.toLowerCase().includes('sales rep') ? 'Unicron Systems' : 'the team';
  return direct ? `Kyle\n${lead}` : `Best,\nKyle\n${lead}`;
}

// Suppress unused EmptyState lint when no drafts edge ever surfaces.
void EmptyState;
