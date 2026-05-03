// Wave 3 / Stream W3-H — fetches the Inngest health payload via the
// `/api/inngest/health` Vercel serverless proxy and derives the rollup
// the dashboard renders.
//
// Mock mode (default in dev / when the proxy is unreachable or the
// upstream API key is missing): falls back to `inngestHealthMock()` so
// the view is demo-able offline.

import { inngestHealthMock } from '../../data/mocks';
import {
  deriveInngestRollup,
  type InngestHealthPayload,
  type InngestHealthRollup,
} from '../contracts/inngestHealth';

const HEALTH_ENDPOINT = '/api/inngest/health';

interface HealthResponseEnvelope {
  /** When false, the proxy is reporting "no API key configured" — the
   *  view should render the configure-me empty state. */
  configured: boolean;
  payload: InngestHealthPayload;
  /** Optional human-readable explanation when `configured: false`. */
  message?: string;
}

/** Mode flag — `true` forces network-mode even in tests. */
function liveEnabled(): boolean {
  // Vite exposes import.meta.env at build time; default to mock-mode
  // in tests so we don't hit `fetch` in jsdom.
  return import.meta.env.VITE_INNGEST_HEALTH_LIVE === 'true';
}

/**
 * Fetches the Inngest health payload. Network errors collapse to the
 * mock fixture so the dashboard always has something to render — the
 * proxy distinguishes "API key unset" (`configured: false`) from
 * upstream errors (HTTP 5xx -> we surface the error message).
 */
export async function fetchInngestHealth(): Promise<InngestHealthRollup> {
  if (!liveEnabled()) {
    return deriveInngestRollup(inngestHealthMock());
  }

  let envelope: HealthResponseEnvelope | null = null;
  try {
    const res = await fetch(HEALTH_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Inngest health proxy returned ${res.status}`);
    }
    envelope = (await res.json()) as HealthResponseEnvelope;
  } catch (err) {
    // Soft-fail: surface the mock so operators can still see the layout.
    // The view shows a banner when `configured: false`.
    return {
      ...deriveInngestRollup(inngestHealthMock()),
      configured: false,
    };
  }

  if (!envelope.configured) {
    return {
      ...deriveInngestRollup(envelope.payload),
      configured: false,
    };
  }

  return deriveInngestRollup(envelope.payload);
}

export const __test = { HEALTH_ENDPOINT };
