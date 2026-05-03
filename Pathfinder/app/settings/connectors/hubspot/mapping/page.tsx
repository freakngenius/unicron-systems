// /pathfinder/settings/connectors/hubspot/mapping — Demo Polish UX Gate 4B-2.

import type { Metadata } from 'next';

import { HubspotMappingForm } from '@/components/settings/connectors/HubspotMappingForm';
import { DEFAULT_ORG_ID } from '@/lib/connectors/auth';
import {
  DEFAULT_HUBSPOT_MAPPING,
  parseMapping,
  type HubspotMappingConfig,
} from '@/lib/connectors/hubspot/mapping';
import { supabaseAdmin } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Pathfinder · HubSpot mapping',
  description: 'Map Pathfinder fields and stages to HubSpot properties.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ConnectorRow {
  id: string;
  status: string;
  account_name: string | null;
  metadata: Record<string, unknown> | null;
}

async function loadConnector(): Promise<ConnectorRow | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => {
            maybeSingle: () => Promise<{
              data: ConnectorRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .select('id, status, account_name, metadata')
    .eq('customer_org_id', DEFAULT_ORG_ID)
    .eq('connector_type', 'hubspot')
    .maybeSingle();
  if (res.error || !res.data) return null;
  return res.data;
}

export default async function HubspotMappingPage(): Promise<React.ReactElement> {
  const connector = await loadConnector().catch(() => null);
  const initial: HubspotMappingConfig = connector
    ? parseMapping((connector.metadata ?? {})['hubspot_mapping'])
    : DEFAULT_HUBSPOT_MAPPING;

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px 24px 48px',
        maxWidth: 1100,
        margin: '0 auto',
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <a
          href="/pathfinder/settings/connectors"
          style={{
            font: '500 11px system-ui, sans-serif',
            color: '#3a3f46',
            textDecoration: 'none',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          ← Connectors
        </a>
        <h1
          style={{
            margin: '6px 0 4px',
            font: '600 24px system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          HubSpot mapping
        </h1>
        <div style={{ font: '400 13px system-ui, sans-serif', color: '#3a3f46' }}>
          {connector?.status === 'connected'
            ? `Connected to ${connector.account_name ?? 'HubSpot'}. Changes apply on the next inbound or outbound sync.`
            : 'HubSpot is not yet connected. Mapping changes are saved locally and applied on first sync after connection.'}
        </div>
      </header>

      <HubspotMappingForm initial={initial} connectorPresent={Boolean(connector)} />
    </main>
  );
}
