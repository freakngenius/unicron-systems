// __tests__/lib/notion/zedcor-writer-enrichment.test.ts
//
// Sprint Z3.5 — unit tests for the additive enrichment helpers in
// lib/notion/zedcor-writer.ts. The network-touching paths
// (writeProjectToNotion / updateProjectEnrichmentInNotion /
// findExistingProjectInNotion) require a real Notion client and are
// covered by the live backfill smoke documented in PR #490.
//
// What this file covers:
//   - enrichmentToNotionProperties produces the right Notion shapes
//     for each property type (rich_text, email, phone_number, date, url)
//   - null / undefined inputs map to the empty-cell shape, not omission
//     (so updates correctly clear previously-populated cells)
//   - missing top-level meta returns {}, making it a safe no-op when
//     called against projects without any extraction yet

import { describe, it, expect } from 'vitest';
import {
  enrichmentToNotionProperties,
  type ZedcorGcMetadata,
} from '@/lib/notion/zedcor-writer';

describe('enrichmentToNotionProperties', () => {
  it('returns {} when meta is null', () => {
    expect(enrichmentToNotionProperties(null)).toEqual({});
  });

  it('returns {} when meta is undefined', () => {
    expect(enrichmentToNotionProperties(undefined)).toEqual({});
  });

  it('returns {} when meta has no enrichment keys (only provenance)', () => {
    // gc_metadata.fetched_at / fetch_status / extraction_layer aren't
    // Notion-mapped — only the 8 user-visible fields are.
    expect(enrichmentToNotionProperties({})).toEqual({});
  });

  it('emits all 8 Notion properties when every field is populated', () => {
    const meta: ZedcorGcMetadata = {
      gc_name: 'Brookstone Construction',
      gc_award_date: '2026-03-14',
      gc_contact_name: 'Jane Tran',
      gc_contact_role: 'Project Manager',
      gc_contact_email: 'jane.tran@brookstone.com',
      gc_contact_phone: '+1-713-555-1984',
      sub_bid_deadline: '2026-04-04',
      subcontract_package_url: 'https://docs.example.com/HD-2026-114.pdf',
    };
    const props = enrichmentToNotionProperties(meta);

    expect(props['GC Name']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'Brookstone Construction' } }],
    });
    expect(props['GC Award Date']).toEqual({ date: { start: '2026-03-14' } });
    expect(props['GC Contact Name']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'Jane Tran' } }],
    });
    expect(props['GC Contact Role']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'Project Manager' } }],
    });
    expect(props['GC Contact Email']).toEqual({ email: 'jane.tran@brookstone.com' });
    expect(props['GC Contact Phone']).toEqual({ phone_number: '+1-713-555-1984' });
    expect(props['Sub-Bid Deadline']).toEqual({ date: { start: '2026-04-04' } });
    expect(props['Subcontract Package URL']).toEqual({
      url: 'https://docs.example.com/HD-2026-114.pdf',
    });
  });

  it('maps explicit null values to empty cells (not omission) so updates clear stale data', () => {
    const meta: ZedcorGcMetadata = {
      gc_name: null,
      gc_award_date: null,
      gc_contact_name: null,
      gc_contact_role: null,
      gc_contact_email: null,
      gc_contact_phone: null,
      sub_bid_deadline: null,
      subcontract_package_url: null,
    };
    const props = enrichmentToNotionProperties(meta);

    expect(props['GC Name']).toEqual({ rich_text: [] });
    expect(props['GC Award Date']).toEqual({ date: null });
    expect(props['GC Contact Name']).toEqual({ rich_text: [] });
    expect(props['GC Contact Role']).toEqual({ rich_text: [] });
    expect(props['GC Contact Email']).toEqual({ email: null });
    expect(props['GC Contact Phone']).toEqual({ phone_number: null });
    expect(props['Sub-Bid Deadline']).toEqual({ date: null });
    expect(props['Subcontract Package URL']).toEqual({ url: null });
  });

  it('only emits properties that are explicitly present (key omission ≠ explicit null)', () => {
    // Layer-1 extraction frequently returns a partial bundle. The
    // writer must NOT clobber Notion cells the caller didn't speak to.
    const meta: ZedcorGcMetadata = {
      gc_name: 'Brookstone Construction',
      gc_contact_email: 'jane.tran@brookstone.com',
    };
    const props = enrichmentToNotionProperties(meta);

    expect(Object.keys(props).sort()).toEqual(['GC Contact Email', 'GC Name']);
    expect(props['GC Name']).toBeDefined();
    expect(props['GC Contact Email']).toBeDefined();
    expect(props['GC Award Date']).toBeUndefined();
    expect(props['Sub-Bid Deadline']).toBeUndefined();
  });

  it('rejects an email lacking an @ sign (defensive against bad upstream data)', () => {
    const props = enrichmentToNotionProperties({ gc_contact_email: 'not-an-email' });
    expect(props['GC Contact Email']).toEqual({ email: null });
  });

  it('passes through phone strings as-is (caller is responsible for +1-XXX-XXX-XXXX format)', () => {
    // The gc-extractor / contact-extractor pre-normalize; the writer
    // trusts them. This test pins that contract.
    const props = enrichmentToNotionProperties({ gc_contact_phone: '+1-832-555-0007' });
    expect(props['GC Contact Phone']).toEqual({ phone_number: '+1-832-555-0007' });
  });

  it('normalizes non-YYYY-MM-DD dates via the existing isoDate helper', () => {
    const props = enrichmentToNotionProperties({ gc_award_date: 'March 14, 2026' });
    expect(props['GC Award Date']).toEqual({ date: { start: '2026-03-14' } });
  });

  it('rejects malformed dates as empty cells, never raises', () => {
    const props = enrichmentToNotionProperties({ gc_award_date: 'soonish' });
    expect(props['GC Award Date']).toEqual({ date: null });
  });

  it('preserves long names by truncating at the writer\'s 2000-char cap', () => {
    const long = 'X'.repeat(3000);
    const props = enrichmentToNotionProperties({ gc_name: long }) as {
      'GC Name': { rich_text: Array<{ text: { content: string } }> };
    };
    expect(props['GC Name'].rich_text[0].text.content.length).toBe(2000);
  });
});
