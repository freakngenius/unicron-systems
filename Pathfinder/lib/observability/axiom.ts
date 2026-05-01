// lib/observability/axiom.ts — Phase 1 G2 Task 3.
//
// Structured logging shim. Calls go to Axiom when AXIOM_TOKEN +
// AXIOM_DATASET are set; otherwise no-op (fail-open). Vercel function
// console.log output also lands in Axiom via the standard Vercel-Axiom
// integration (configured in Vercel dashboard); this module is for
// cases where we want explicit structured events that survive the
// console-format conversion.
//
// Pattern matches lib/notifications.ts and other existing observability
// surfaces — a single export, fire-and-forget, errors logged to console
// instead of bubbling.

interface AxiomEvent {
  level: 'info' | 'warn' | 'error';
  message: string;
  surface: 'cron' | 'inngest' | 'llm-gateway' | 'cost-alert' | 'manual';
  [key: string]: unknown;
}

const AXIOM_INGEST_URL = 'https://api.axiom.co/v1/datasets';

function isAxiomConfigured(): boolean {
  return Boolean(process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET);
}

export function logAxiom(event: AxiomEvent): void {
  if (!isAxiomConfigured()) return;
  void sendEvent(event).catch((err) => {
    console.error('[axiom] ingest failed (non-fatal)', err);
  });
}

async function sendEvent(event: AxiomEvent): Promise<void> {
  const token = process.env.AXIOM_TOKEN!;
  const dataset = process.env.AXIOM_DATASET!;
  const res = await fetch(`${AXIOM_INGEST_URL}/${dataset}/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        _time: new Date().toISOString(),
        ...event,
      },
    ]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable body>');
    throw new Error(`axiom ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Convenience for the common case: log + console.* mirror so local dev
 * sees everything Axiom records.
 */
export function trackEvent(event: AxiomEvent): void {
  const consoleFn =
    event.level === 'error'
      ? console.error
      : event.level === 'warn'
        ? console.warn
        : console.log;
  consoleFn(`[${event.surface}] ${event.message}`, event);
  logAxiom(event);
}
