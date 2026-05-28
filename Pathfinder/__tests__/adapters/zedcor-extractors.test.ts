// __tests__/adapters/zedcor-extractors.test.ts
//
// Sprint Z3.5 — unit smoke for the layer-1 cheerio extractors. The
// network-dependent + Anthropic-dependent paths are covered by the
// integration smoke documented in the Z3.5 PR description; here we
// exercise the pure-function HTML scanners with synthetic fixtures so
// regressions in the structural patterns are caught at typecheck time.

import { describe, it, expect } from 'vitest';
import {
  extractContactFromHtml,
  normalizeUsPhone,
  parseNameAndRole,
} from '@/lib/adapters/zedcor/contact-extractor';
import { __internal } from '@/lib/adapters/zedcor/gc-extractor';

const { extractGcFieldsFromHtml: _ignoreInternalName } = (() => ({
  // We re-export through __internal but keep the test importing what
  // the adapter actually exposes. The extractor's internal scanner is
  // exercised through real fixtures below.
  extractGcFieldsFromHtml: undefined,
}))();
void _ignoreInternalName;
void __internal;

const AWARD_NOTICE_FIXTURE = `
<!doctype html>
<html><body>
  <h1>Notice of Award — Houston District Headquarters Renovation</h1>
  <table>
    <tr><th>Solicitation #</th><td>HD-2026-114</td></tr>
    <tr><th>Awarded To</th><td>Brookstone Construction, Inc.</td></tr>
    <tr><th>Award Date</th><td>March 14, 2026</td></tr>
    <tr><th>Sub-bid Deadline</th><td>April 04, 2026</td></tr>
  </table>
  <h2>Contact for Subcontractors</h2>
  <p>
    Project Manager: <a href="mailto:jane.tran@brookstoneconstruction.com">Jane Tran</a><br/>
    Phone: <a href="tel:+17135551984">(713) 555-1984</a>
  </p>
  <p>
    Bid documents available at
    <a href="https://docs.example.com/HD-2026-114/sub-packages.pdf">Subcontract Packages</a>.
  </p>
</body></html>
`;

const GENERIC_MAILBOX_FIXTURE = `
<!doctype html>
<html><body>
  <p>For inquiries please contact <a href="mailto:info@example.com">info@example.com</a>.</p>
  <p>Contact: <a href="mailto:susan.lee@primecontractors.com">Susan Lee, Subcontract Administrator</a></p>
  <p>Tel: 832.555.0007</p>
</body></html>
`;

describe('normalizeUsPhone', () => {
  it('normalizes assorted US formats to +1-XXX-XXX-XXXX', () => {
    expect(normalizeUsPhone('(713) 555-1984')).toBe('+1-713-555-1984');
    expect(normalizeUsPhone('713.555.1984')).toBe('+1-713-555-1984');
    expect(normalizeUsPhone('7135551984')).toBe('+1-713-555-1984');
    expect(normalizeUsPhone('+1 713 555 1984')).toBe('+1-713-555-1984');
  });

  it('rejects non-US-shape numbers', () => {
    expect(normalizeUsPhone('123')).toBeNull();
    expect(normalizeUsPhone('000-555-1984')).toBeNull(); // area code starts with 0
    expect(normalizeUsPhone('+44 20 7946 0958')).toBeNull(); // UK
  });
});

describe('parseNameAndRole', () => {
  it('extracts "Name, Role" pairs', () => {
    expect(parseNameAndRole('Susan Lee, Subcontract Administrator')).toEqual({
      name: 'Susan Lee',
      role: expect.stringMatching(/subcontract/i),
    });
  });

  it('returns name-only when no role pattern matches', () => {
    expect(parseNameAndRole('Jane Tran')).toEqual({ name: 'Jane Tran', role: null });
  });

  it('rejects single-token capitalized strings', () => {
    expect(parseNameAndRole('Houston')).toEqual({ name: null, role: null });
  });
});

describe('extractContactFromHtml', () => {
  it('pulls a non-generic email and a normalized phone from a contact block', () => {
    const r = extractContactFromHtml(AWARD_NOTICE_FIXTURE);
    expect(r.gc_contact_email).toBe('jane.tran@brookstoneconstruction.com');
    expect(r.gc_contact_phone).toBe('+1-713-555-1984');
  });

  it('prefers a person mailbox over a generic info@ mailbox', () => {
    const r = extractContactFromHtml(GENERIC_MAILBOX_FIXTURE);
    expect(r.gc_contact_email).toBe('susan.lee@primecontractors.com');
  });

  it('falls back to the page-wide tel: link when no labeled block exists', () => {
    const html = `<html><body><a href="tel:8325550007">Call us</a></body></html>`;
    const r = extractContactFromHtml(html);
    expect(r.gc_contact_phone).toBe('+1-832-555-0007');
  });

  it('returns nulls when there is no extractable contact data', () => {
    const r = extractContactFromHtml('<html><body><p>Hello world.</p></body></html>');
    expect(r).toEqual({
      gc_contact_name: null,
      gc_contact_role: null,
      gc_contact_email: null,
      gc_contact_phone: null,
    });
  });
});

// ─── gc-extractor pure helpers ────────────────────────────────────────────

describe('gc-extractor toIsoDate', () => {
  it('passes through YYYY-MM-DD', () => {
    expect(__internal.toIsoDate('2026-03-14')).toBe('2026-03-14');
  });
  it('parses common english date formats', () => {
    expect(__internal.toIsoDate('March 14, 2026')).toBe('2026-03-14');
    expect(__internal.toIsoDate('3/14/2026')).toBe('2026-03-14');
  });
  it('returns null for un-parseable input', () => {
    expect(__internal.toIsoDate('soonish')).toBeNull();
    expect(__internal.toIsoDate(null)).toBeNull();
    expect(__internal.toIsoDate('')).toBeNull();
  });
});

describe('gc-extractor parseJsonFromAnthropic', () => {
  it('extracts a JSON object from a fenced block', () => {
    const out = __internal.parseJsonFromAnthropic('Here you go:\n```json\n{"gc_name":"ACME"}\n```');
    expect(out).toEqual({ gc_name: 'ACME' });
  });
  it('extracts a JSON object from raw text with preamble', () => {
    const out = __internal.parseJsonFromAnthropic('Output: {"gc_name":"ACME","gc_award_date":"2026-03-14"}');
    expect(out).toEqual({ gc_name: 'ACME', gc_award_date: '2026-03-14' });
  });
  it('returns null when no JSON block is present', () => {
    expect(__internal.parseJsonFromAnthropic('no json here')).toBeNull();
  });
});

describe('gc-extractor extractGcFieldsFromHtml (via __internal)', () => {
  it('pulls gc_name, award date, sub-bid date, and package URL from an award notice', () => {
    const fields = __internal.extractGcFieldsFromHtml(AWARD_NOTICE_FIXTURE);
    expect(fields.gc_name).toBe('Brookstone Construction, Inc.');
    expect(fields.gc_award_date).toBe('2026-03-14');
    expect(fields.sub_bid_deadline).toBe('2026-04-04');
    expect(fields.subcontract_package_url).toBe('https://docs.example.com/HD-2026-114/sub-packages.pdf');
    // contact extractor wiring carries through
    expect(fields.gc_contact_email).toBe('jane.tran@brookstoneconstruction.com');
    expect(fields.gc_contact_phone).toBe('+1-713-555-1984');
  });
});
