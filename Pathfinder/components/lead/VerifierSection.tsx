'use client';

// components/lead/VerifierSection.tsx — Demo Polish UX Gate 18D extends
// Gate 9A. When `verified === false`, render the failure reason +
// suggestions list + "Attempt Verification" retry button. Polls the
// /verifier/retry status endpoint every 5s for up to 60s after a click,
// then refreshes the section from the server response.

import * as React from 'react';

import { VerifierBadge } from '@/components/ProjectList';
import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

import { SectionHeading } from './SectionHeading';

interface Props {
  project: Project;
}

interface VerifierStatus {
  verified: boolean | null;
  failureReason: string | null;
  suggestions: string[];
  attemptCount: number;
  lastAttemptAt: string | null;
  notes: string | null;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_MS = 60_000;

function statusSub(verified: boolean | null | undefined): string {
  if (verified === true) return 'passed · all 4 checks';
  if (verified === false) return 'unverified';
  return 'awaiting verifier';
}

function bodyText(
  verified: boolean | null | undefined,
  notes: string | null | undefined,
): string {
  const trimmed = (notes ?? '').trim();
  if (verified == null) {
    return 'Pending verification — Generator-Verifier loop will check rationale, branch attribution, score sensibility, and customer references.';
  }
  if (verified === true) {
    return trimmed.length > 0
      ? trimmed
      : 'Verifier passed all 4 checks (rationale · branch · score · customer-refs).';
  }
  return trimmed.length > 0 ? trimmed : 'Verifier flagged at least one check.';
}

export function VerifierSection({ project }: Props): React.ReactElement {
  const initialStatus: VerifierStatus = {
    verified: project.verified ?? null,
    failureReason: project.verifier_failure_reason ?? null,
    suggestions: project.verifier_suggestions ?? [],
    attemptCount: project.verifier_attempt_count ?? 0,
    lastAttemptAt: project.verifier_last_attempt_at ?? null,
    notes: project.verifier_notes ?? null,
  };
  const [status, setStatus] = React.useState<VerifierStatus>(initialStatus);
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);

  const passCount = project.verifier_pass_count ?? 0;
  const isUnverified = status.verified === false;

  const pollUntilUpdate = React.useCallback(
    async (initialStamp: string | null) => {
      const start = Date.now();
      while (Date.now() - start < POLL_MAX_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          const resp = await fetch(
            `/api/leads/${encodeURIComponent(project.id)}/verifier/retry`,
            { method: 'GET', cache: 'no-store' },
          );
          if (!resp.ok) continue;
          const next = (await resp.json()) as Partial<VerifierStatus>;
          if (
            typeof next.verified !== 'undefined' &&
            (next.failureReason !== status.failureReason ||
              JSON.stringify(next.suggestions) !== JSON.stringify(status.suggestions) ||
              next.verified !== status.verified)
          ) {
            setStatus({
              verified: next.verified ?? null,
              failureReason: next.failureReason ?? null,
              suggestions: next.suggestions ?? [],
              attemptCount: next.attemptCount ?? status.attemptCount,
              lastAttemptAt: next.lastAttemptAt ?? initialStamp,
              notes: next.notes ?? null,
            });
            return;
          }
        } catch {
          // ignore transient polling errors
        }
      }
    },
    [project.id, status.failureReason, status.suggestions, status.verified, status.attemptCount],
  );

  const handleRetry = React.useCallback(async () => {
    setRetryError(null);
    setRetrying(true);
    try {
      const resp = await fetch(
        `/api/leads/${encodeURIComponent(project.id)}/verifier/retry`,
        { method: 'POST' },
      );
      if (!resp.ok && resp.status !== 202) {
        const detail = await resp.json().catch(() => ({}));
        setRetryError(
          typeof (detail as { error?: string }).error === 'string'
            ? (detail as { error: string }).error
            : `Retry failed (${resp.status})`,
        );
        return;
      }
      const data = (await resp.json()) as {
        attemptCount?: number;
        lastAttemptAt?: string;
        debounced?: boolean;
      };
      setStatus((prev) => ({
        ...prev,
        attemptCount: data.attemptCount ?? prev.attemptCount,
        lastAttemptAt: data.lastAttemptAt ?? prev.lastAttemptAt,
      }));
      if (!data.debounced) {
        await pollUntilUpdate(data.lastAttemptAt ?? null);
      }
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }, [project.id, pollUntilUpdate]);

  const headingTitle = isUnverified ? 'Verifier — Unverified' : 'Verifier';
  return (
    <section data-testid="lead-detail-verifier-section">
      <SectionHeading title={headingTitle} sub={statusSub(status.verified)} />
      <div
        style={{
          background: PF_TINTS.bg,
          border: `1px solid ${isUnverified ? 'rgba(184,77,77,0.45)' : PF_TINTS.ruleSoft}`,
          borderRadius: PF_TINTS.r.md,
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <VerifierBadge verified={status.verified} />
            {passCount > 0 && (
              <span
                style={{
                  font: `500 10px ${PF_TINTS.mono}`,
                  color: PF_TINTS.inkDim,
                  letterSpacing: '0.04em',
                }}
              >
                pass count · {passCount}
              </span>
            )}
            {isUnverified && status.attemptCount > 0 && (
              <span
                style={{
                  font: `500 10px ${PF_TINTS.mono}`,
                  color: PF_TINTS.inkDim,
                  letterSpacing: '0.04em',
                }}
              >
                attempts · {status.attemptCount}
              </span>
            )}
          </div>
          {isUnverified && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              data-testid="lead-detail-verifier-retry"
              style={{
                appearance: 'none',
                border: '1px solid rgba(10,10,10,0.18)',
                borderRadius: 4,
                background: retrying ? 'rgba(10,10,10,0.04)' : '#ffffff',
                color: retrying ? PF_TINTS.inkDim : PF_TINTS.ink,
                font: `600 11px ${PF_TINTS.mono}`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '6px 10px',
                cursor: retrying ? 'not-allowed' : 'pointer',
              }}
            >
              {retrying ? 'Re-verifying…' : 'Attempt Verification'}
            </button>
          )}
        </div>
        {isUnverified && status.failureReason ? (
          <p
            style={{
              margin: '0 0 10px',
              font: `400 13px/1.55 ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
            }}
          >
            {status.failureReason}
          </p>
        ) : (
          <p
            style={{
              margin: '0 0 10px',
              font: `400 13px/1.55 ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
            }}
          >
            {bodyText(status.verified, status.notes)}
          </p>
        )}
        {isUnverified && status.suggestions.length > 0 && (
          <ul
            data-testid="lead-detail-verifier-suggestions"
            style={{
              margin: 0,
              padding: '0 0 0 18px',
              font: `400 13px/1.55 ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
            }}
          >
            {status.suggestions.map((s, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                {s}
              </li>
            ))}
          </ul>
        )}
        {retryError && (
          <p
            style={{
              margin: '8px 0 0',
              font: `500 11px ${PF_TINTS.mono}`,
              color: '#b84d4d',
              letterSpacing: '0.04em',
            }}
          >
            {retryError}
          </p>
        )}
      </div>
    </section>
  );
}
