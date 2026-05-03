// tests/connectors/hubspot-field-mapper.test.ts — Gate 10C.
// Pure tests on the lead → HubSpot deal field mapper.

import { describe, expect, it } from 'vitest';

import {
  buildContactProperties,
  buildDealProperties,
  closedateMsFor,
  companyNameFor,
  dealnameFor,
  descriptionFor,
  normalizeProjectStage,
} from '../../lib/hubspot/field-mapper';
import type { Project } from '../../lib/types';

const baseProject: Project = {
  id: 'sam.gov:TXDOT-I45-2026-001',
  source: 'sam.gov',
  source_id: 'TXDOT-I45-2026-001',
  title: 'TxDOT I-45 corridor reconstruction',
  summary: 'Federal highway reconstruction.',
  lat: 29.83,
  lon: -95.35,
  project_value: 4_200_000,
  project_stage: 'Pre-bid',
  posted_date: '2026-04-15T00:00:00.000Z',
  raw_payload: null,
  rationale: 'High-value federal project.',
  rationale_streamed_at: null,
  score: 92,
  nearest_branch_id: 'hou-002',
  distance_miles: 8.2,
  outreach_hook: null,
  warm_for_customer_id: null,
  ingested_at: '2026-04-15T00:00:00.000Z',
  ranked_at: null,
};

describe('field-mapper', () => {
  describe('normalizeProjectStage', () => {
    it('maps Pre-bid → qualifiedtobuy', () => {
      expect(normalizeProjectStage('Pre-bid')).toBe('qualifiedtobuy');
      expect(normalizeProjectStage('pre-bid')).toBe('qualifiedtobuy');
      expect(normalizeProjectStage('PRE-BID')).toBe('qualifiedtobuy');
    });
    it('maps RFP open / Bidding → presentationscheduled', () => {
      expect(normalizeProjectStage('RFP open')).toBe('presentationscheduled');
      expect(normalizeProjectStage('Bidding')).toBe('presentationscheduled');
    });
    it('maps Awarded / Won → decisionmakerboughtin', () => {
      expect(normalizeProjectStage('Awarded')).toBe('decisionmakerboughtin');
      expect(normalizeProjectStage('won')).toBe('decisionmakerboughtin');
    });
    it('defaults to appointmentscheduled for null / unknown / Announcement', () => {
      expect(normalizeProjectStage(null)).toBe('appointmentscheduled');
      expect(normalizeProjectStage('Announcement')).toBe('appointmentscheduled');
      expect(normalizeProjectStage('something-weird')).toBe('appointmentscheduled');
    });
  });

  describe('descriptionFor', () => {
    it('prefers summary when present', () => {
      expect(descriptionFor(baseProject)).toBe('Federal highway reconstruction.');
    });
    it('falls back to rationale when summary is null', () => {
      expect(descriptionFor({ ...baseProject, summary: null })).toBe('High-value federal project.');
    });
    it('falls back to a stub when both are null', () => {
      const stub = descriptionFor({ ...baseProject, summary: null, rationale: null });
      expect(stub).toContain('sam.gov');
    });
  });

  describe('dealnameFor', () => {
    it('appends branch suffix when provided', () => {
      expect(dealnameFor(baseProject, 'HOU-002')).toBe(
        'TxDOT I-45 corridor reconstruction · HOU-002',
      );
    });
    it('omits suffix when branchCode is null', () => {
      expect(dealnameFor(baseProject, null)).toBe('TxDOT I-45 corridor reconstruction');
    });
    it('preserves branch suffix on truncation', () => {
      const longTitle = 'X'.repeat(300);
      const result = dealnameFor({ ...baseProject, title: longTitle }, 'HOU-002');
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result.endsWith(' · HOU-002')).toBe(true);
    });
  });

  describe('closedateMsFor', () => {
    it('uses estimated_end_date when present', () => {
      const ms = closedateMsFor({
        ...baseProject,
        estimated_end_date: '2026-12-31T00:00:00.000Z',
      });
      expect(ms).toBe(Date.parse('2026-12-31T00:00:00.000Z'));
    });
    it('falls back to posted_date + 90d', () => {
      const ms = closedateMsFor({ ...baseProject, posted_date: '2026-04-15T00:00:00.000Z' });
      const expected = Date.parse('2026-04-15T00:00:00.000Z') + 90 * 24 * 60 * 60 * 1000;
      expect(ms).toBe(expected);
    });
    it('falls back to now + 90d when neither is present', () => {
      const fakeNow = Date.parse('2026-05-03T00:00:00.000Z');
      const ms = closedateMsFor({ ...baseProject, posted_date: null, estimated_end_date: null }, fakeNow);
      expect(ms).toBe(fakeNow + 90 * 24 * 60 * 60 * 1000);
    });
  });

  describe('buildDealProperties', () => {
    it('emits the canonical field set per spec', () => {
      const props = buildDealProperties({
        project: { ...baseProject, naics_description: 'Highway Construction' },
        branchName: 'Houston',
        branchCode: 'HOU-002',
        hubspotStageId: 'qualifiedtobuy',
        hubspotPipelineId: 'pipeline-default',
      });
      expect(props.dealname).toBe('TxDOT I-45 corridor reconstruction · HOU-002');
      expect(props.amount).toBe(4_200_000);
      expect(props.dealstage).toBe('qualifiedtobuy');
      expect(props.pipeline).toBe('pipeline-default');
      expect(props.pathfinder_lead_id).toBe('sam.gov:TXDOT-I45-2026-001');
      expect(props.pathfinder_source_id).toBe('sam.gov:TXDOT-I45-2026-001');
      expect(props.pathfinder_score).toBe(92);
      expect(props.pathfinder_branch).toBe('Houston');
      expect(props.pathfinder_industry).toBe('Highway Construction');
      expect(props.hs_lead_source).toBe('OTHER_CAMPAIGNS');
    });
    it('omits amount when project_value is null', () => {
      const props = buildDealProperties({
        project: { ...baseProject, project_value: null },
        branchName: null,
        branchCode: null,
        hubspotStageId: null,
        hubspotPipelineId: null,
      });
      expect(props.amount).toBeUndefined();
      expect(props.pathfinder_branch).toBeUndefined();
      expect(props.dealstage).toBeUndefined();
      expect(props.pipeline).toBeUndefined();
    });
    it('omits pathfinder_score when score is null', () => {
      const props = buildDealProperties({
        project: { ...baseProject, score: null },
        branchName: null,
        branchCode: null,
        hubspotStageId: null,
        hubspotPipelineId: null,
      });
      expect(props.pathfinder_score).toBeUndefined();
    });
  });

  describe('buildContactProperties', () => {
    it('splits the contact name into firstname + lastname', () => {
      const out = buildContactProperties(
        { contact_name: 'Alice McDermott', email: 'alice@example.com', phone: null, role: 'Director' },
        'TxDOT',
      );
      expect(out.firstname).toBe('Alice');
      expect(out.lastname).toBe('McDermott');
      expect(out.email).toBe('alice@example.com');
      expect(out.jobtitle).toBe('Director');
      expect(out.company).toBe('TxDOT');
    });
    it('drops empty fields so HubSpot create does not 400 on email=""', () => {
      const out = buildContactProperties(
        { contact_name: 'Bob', email: null, phone: '   ', role: null },
        null,
      );
      expect(out.email).toBeUndefined();
      expect(out.phone).toBeUndefined();
      expect(out.jobtitle).toBeUndefined();
      expect(out.company).toBeUndefined();
      expect(out.firstname).toBe('Bob');
    });
  });

  describe('companyNameFor', () => {
    it('returns project.title when present', () => {
      expect(companyNameFor(baseProject)).toBe('TxDOT I-45 corridor reconstruction');
    });
    it('falls back to source:source_id when title is empty', () => {
      expect(companyNameFor({ ...baseProject, title: '' })).toBe('sam.gov:TXDOT-I45-2026-001');
    });
  });
});
