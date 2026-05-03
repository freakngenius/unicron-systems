// @vitest-environment jsdom
//
// Unit tests for components/lead/SourceRecord (Gate 8X-3).
//
// Fixtures mirror real shapes seen in production: sam.gov Whiteriver
// solicitation, usaspending VA award, harris county permit, news article.

import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { SourceRecord } from '@/components/lead/SourceRecord';
import type { Project } from '@/lib/types';

afterEach(() => {
  cleanup();
});

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 'sam.gov:fixture',
    source: 'sam.gov',
    title: 'Fixture',
    score: 70,
    rationale: null,
    project_value: null,
    state: null,
    posted_date: null,
    summary: null,
    sub_tier: null,
    nearest_branch_id: null,
    nearest_branch_name: null,
    distance_miles: null,
    rejection_reason: null,
    rejected_at: null,
    nearest_zedcor_branch_id: null,
    zedcor_distance_miles: null,
    raw_payload: null,
    ...over,
  } as unknown as Project;
}

describe('SourceRecord — sam.gov', () => {
  it('renders solicitation card with agency, office, set-aside, soln, deadline + sam.gov link', () => {
    render(
      <SourceRecord
        project={makeProject({
          source: 'sam.gov',
          raw_payload: {
            fullParentPathName:
              'HEALTH AND HUMAN SERVICES, DEPARTMENT OF.INDIAN HEALTH SERVICE.DIV OF ENGINEERING SVCS - SEATTLE',
            officeAddress: { city: 'SEATTLE', state: 'WA', zipcode: '98121' },
            typeOfSetAsideDescription: 'Total Small Business Set-Aside',
            solicitationNumber: '75H70126R00016',
            uiLink:
              'https://sam.gov/workspace/contract/opp/abc/view',
            responseDeadLine: '2026-05-28T14:00:00-07:00',
            archiveDate: '2026-06-30',
          } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(screen.getByTestId('raw-payload-samgov')).toBeInTheDocument();
    expect(screen.getByTestId('raw-payload-samgov-link')).toHaveAttribute(
      'href',
      'https://sam.gov/workspace/contract/opp/abc/view',
    );
    expect(screen.getByText('SEATTLE, WA, 98121')).toBeInTheDocument();
    expect(screen.getByText('75H70126R00016')).toBeInTheDocument();
    // Set-aside is rendered (case-insensitive match for the chip).
    expect(
      screen.getByText(/Total Small Business Set-Aside/i),
    ).toBeInTheDocument();
    // Agency breadcrumb leaves the leaf segment present.
    expect(
      screen.getByText('DIV OF ENGINEERING SVCS - SEATTLE'),
    ).toBeInTheDocument();
  });

  it('hides set-aside when value is "No Set aside used" (signal noise)', () => {
    render(
      <SourceRecord
        project={makeProject({
          source: 'sam.gov',
          raw_payload: {
            typeOfSetAsideDescription: 'No Set aside used',
            solicitationNumber: 'X123',
          } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(screen.queryByText(/no set aside used/i)).not.toBeInTheDocument();
    expect(screen.getByText('X123')).toBeInTheDocument();
  });

  it('returns null when raw_payload is null', () => {
    const { container } = render(
      <SourceRecord project={makeProject({ source: 'sam.gov', raw_payload: null })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when no fields populate any row', () => {
    const { container } = render(
      <SourceRecord
        project={makeProject({
          source: 'sam.gov',
          raw_payload: { someOtherField: 'x' } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('SourceRecord — usaspending', () => {
  it('renders award card with recipient, agency, award id, period, place + usaspending link', () => {
    render(
      <SourceRecord
        project={makeProject({
          source: 'usaspending',
          raw_payload: {
            'Recipient Name': 'ACME Construction Inc',
            'Awarding Agency': 'Department of Veterans Affairs',
            'Award ID': 'CONT_AWD_36C24824D0001',
            'Period of Performance Start Date': '2026-01-15',
            'Period of Performance Current End Date': '2026-12-31',
            'Place of Performance State Code': 'TX',
            'Place of Performance City Code': 'HOUSTON',
            agency_slug: 'department-of-veterans-affairs',
          } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(screen.getByTestId('raw-payload-usaspending')).toBeInTheDocument();
    expect(screen.getByText('ACME Construction Inc')).toBeInTheDocument();
    expect(
      screen.getByText('Department of Veterans Affairs'),
    ).toBeInTheDocument();
    expect(screen.getByText('CONT_AWD_36C24824D0001')).toBeInTheDocument();
    expect(screen.getByText('2026-01-15 → 2026-12-31')).toBeInTheDocument();
    expect(screen.getByText('HOUSTON, TX')).toBeInTheDocument();
    const link = screen.getByTestId('raw-payload-usaspending-link');
    expect(link).toHaveAttribute(
      'href',
      'https://www.usaspending.gov/award/CONT_AWD_36C24824D0001/department-of-veterans-affairs',
    );
  });

  it('falls back to keyword search link when agency_slug missing', () => {
    render(
      <SourceRecord
        project={makeProject({
          source: 'usaspending',
          raw_payload: {
            'Award ID': 'AWD_123',
          } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(screen.getByTestId('raw-payload-usaspending-link')).toHaveAttribute(
      'href',
      'https://www.usaspending.gov/search/?keywords=AWD_123',
    );
  });
});

describe('SourceRecord — harris', () => {
  it('renders permit type, filing date, address, contractor flag', () => {
    render(
      <SourceRecord
        project={makeProject({
          source: 'harris' as Project['source'],
          raw_payload: {
            permit_type: 'commercial-renovation',
            filing_date: '2026-04-21',
            address: '1234 Main St, Houston, TX',
            contractor_listed: true,
          } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(screen.getByTestId('raw-payload-harris')).toBeInTheDocument();
    expect(screen.getByText(/commercial-renovation/i)).toBeInTheDocument();
    expect(screen.getByText('2026-04-21')).toBeInTheDocument();
    expect(screen.getByText('1234 Main St, Houston, TX')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders No when contractor_listed is false', () => {
    render(
      <SourceRecord
        project={makeProject({
          source: 'harris' as Project['source'],
          raw_payload: {
            permit_type: 'demolition',
            contractor_listed: false,
          } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(screen.getByText('No')).toBeInTheDocument();
  });
});

describe('SourceRecord — news', () => {
  it('renders publication, link to article, published date', () => {
    render(
      <SourceRecord
        project={makeProject({
          source: 'news',
          raw_payload: {
            publication: 'Houston Chronicle',
            url: 'https://houstonchronicle.com/business/2026-04-22',
            published_at: '2026-04-22',
          } as unknown as Record<string, unknown>,
        })}
      />,
    );
    expect(screen.getByTestId('raw-payload-news')).toBeInTheDocument();
    expect(screen.getByText('Houston Chronicle')).toBeInTheDocument();
    expect(screen.getByText('2026-04-22')).toBeInTheDocument();
    expect(screen.getByTestId('raw-payload-news-link')).toHaveAttribute(
      'href',
      'https://houstonchronicle.com/business/2026-04-22',
    );
  });
});

describe('SourceRecord — unknown source', () => {
  it('returns null for an unrecognized source', () => {
    const { container } = render(
      <SourceRecord
        project={makeProject({ source: 'mystery' as Project['source'] })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
