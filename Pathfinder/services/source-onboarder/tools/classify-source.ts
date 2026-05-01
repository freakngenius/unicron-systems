// services/source-onboarder/tools/classify-source.ts
//
// Classifies a candidate URL into one of:
//   tier_1: socrata | rest | rss | json-dump
//   tier_2: js_rendering | auth_required | pdf_inconsistent | format_unrecognized
//   tier_3: paid_only | no_digital_exposure
//
// Deterministic rules first; LLM fallback is intentionally not used here for
// Tier 1 — Socrata / RSS / Atom / JSON-array are detectable by content type +
// URL pattern. SPEC §6 step 2 ("classify source type"). Cost-discipline win:
// classification stays at $0.

import type { SourceClassification } from '../types';
import { webFetch } from './web-fetch';
import { parseHtml, parseXml } from './parse';

const SOCRATA_HOST_RE = /(\.socrata\.com|\/resource\/[^/]+\.json)/i;
const SOCRATA_RESOURCE_PATH = /\/resource\/[a-z0-9_-]+\.(json|csv)/i;

export interface ClassifyOptions {
  hint?: 'socrata' | 'rest' | 'rss' | 'json-dump';
}

export async function classifySource(url: string, opts: ClassifyOptions = {}): Promise<{ classification: SourceClassification; sample?: { contentType: string; bodyHead: string } }> {
  // Strong URL signals first
  if (opts.hint) {
    return { classification: { kind: opts.hint, confidence: 0.9 } };
  }
  if (SOCRATA_HOST_RE.test(url) || SOCRATA_RESOURCE_PATH.test(url)) {
    return { classification: { kind: 'socrata', confidence: 0.95 } };
  }
  if (/\.(rss|atom|xml)(\?|$)/i.test(url)) {
    // Confirm via fetch
  }
  if (/\.json(\?|$)/i.test(url) && !SOCRATA_RESOURCE_PATH.test(url)) {
    // Could be json-dump or rest — fetch + inspect
  }

  let res;
  try {
    res = await webFetch(url, { timeoutMs: 15_000, maxBodyBytes: 128 * 1024 });
  } catch (e) {
    return {
      classification: {
        kind: 'tier_2',
        reason: 'format_unrecognized',
        confidence: 0.5,
      },
      sample: undefined,
    };
  }

  const ct = res.contentType.toLowerCase();
  const head = res.body.slice(0, 4000);
  const sample = { contentType: ct, bodyHead: head };

  if (res.status === 401 || res.status === 403) {
    return { classification: { kind: 'tier_2', reason: 'auth_required', confidence: 0.95 }, sample };
  }
  if (res.status === 402 || /paywall|subscription\s+(?:required|only)|paid\s+(?:subscription|access|only|membership)/i.test(head)) {
    return { classification: { kind: 'tier_3', reason: 'paid_only', confidence: 0.9 }, sample };
  }
  if (ct.includes('application/pdf') || /^%PDF-/.test(head)) {
    return { classification: { kind: 'tier_2', reason: 'pdf_inconsistent', confidence: 0.9 }, sample };
  }

  if (ct.includes('json') || /^\s*[\[{]/.test(head)) {
    if (SOCRATA_RESOURCE_PATH.test(url)) {
      return { classification: { kind: 'socrata', confidence: 0.95 }, sample };
    }
    if (/^\s*\[/.test(head)) {
      // bare array — likely json-dump if URL is a static path, else rest
      const isStaticDump = !/[?&](?:page|offset|limit|cursor|pageToken)=/i.test(url);
      return {
        classification: { kind: isStaticDump ? 'json-dump' : 'rest', confidence: 0.85 },
        sample,
      };
    }
    return { classification: { kind: 'rest', confidence: 0.8 }, sample };
  }

  if (ct.includes('xml') || /^\s*<\?xml|^\s*<rss|^\s*<feed/i.test(head)) {
    const xml = parseXml(head);
    if (xml.isRss || xml.isAtom) {
      return { classification: { kind: 'rss', confidence: 0.95 }, sample };
    }
    if (xml.isOData) {
      return { classification: { kind: 'rest', confidence: 0.85 }, sample };
    }
    return { classification: { kind: 'tier_2', reason: 'format_unrecognized', confidence: 0.6 }, sample };
  }

  if (ct.includes('html') || /^\s*<!doctype html/i.test(head)) {
    const parsed = parseHtml(head);
    if (parsed.hasJsRenderRoot) {
      return { classification: { kind: 'tier_2', reason: 'js_rendering', confidence: 0.85 }, sample };
    }
    if (parsed.hasLoginForm) {
      return { classification: { kind: 'tier_2', reason: 'auth_required', confidence: 0.85 }, sample };
    }
    if (parsed.schemaHints.rssCandidates.length > 0) {
      return {
        classification: { kind: 'rss', confidence: 0.7 },
        sample: { ...sample, bodyHead: parsed.schemaHints.rssCandidates[0] },
      };
    }
    if (parsed.schemaHints.apiCandidates.length > 0) {
      return { classification: { kind: 'rest', confidence: 0.6 }, sample };
    }
    return { classification: { kind: 'tier_2', reason: 'format_unrecognized', confidence: 0.5 }, sample };
  }

  return { classification: { kind: 'tier_2', reason: 'format_unrecognized', confidence: 0.3 }, sample };
}
