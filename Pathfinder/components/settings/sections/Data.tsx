'use client';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { Button, Card, Phase2Banner, Row } from '../Field';

const TABLES: { name: string; description: string }[] = [
  { name: 'projects', description: 'All ingested + ranked + verified projects.' },
  { name: 'branches', description: 'Zedcor branch footprint (5 in pilot).' },
  { name: 'customers', description: 'Existing Zedcor customers (synthetic in pilot).' },
  { name: 'agent_log', description: 'Per-event log of every agent action.' },
  { name: 'agent_runs', description: 'Cycle-level lifecycle rows for every agent.' },
  { name: 'adjacent_targets', description: 'Adjacent-vertical companies surfaced by the Adjacent agent.' },
];

export function DataSection() {
  return (
    <>
      <Card
        title="Data export"
        description="Download any pathfinder.* table as CSV. Generates from /api/projects, /api/branches, /api/customers, /api/activity. Other tables ship in Phase 2."
      >
        {TABLES.map((t) => (
          <Row key={t.name} label={`pathfinder.${t.name}`} hint={t.description}>
            <ExportButton table={t.name} />
          </Row>
        ))}
        <div
          style={{
            padding: '10px 18px',
            font: `400 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.04em',
            borderTop: `1px solid ${PF_TINTS.ruleHair}`,
          }}
        >
          exports run client-side from the dashboard&apos;s read endpoints
        </div>
      </Card>

      <Card title="Data retention">
        <Phase2Banner note="Configurable retention window for agent_log + historical projects. Default in pilot: forever. Phase 2 production lets the operator dial this." />
      </Card>

      <Card title="Privacy controls (on-prem matching layer)">
        <Phase2Banner note="When Zedcor's real data lands, on-prem matching against their MySQL via the L4 GPU container is configured + audited here." />
      </Card>
    </>
  );
}

function ExportButton({ table }: { table: string }) {
  const onClick = async () => {
    // Map table → read endpoint where one exists; fall back to disabled.
    const endpoints: Record<string, string> = {
      projects: '/pathfinder/api/projects',
      branches: '/pathfinder/api/branches',
      customers: '/pathfinder/api/customers',
      agent_log: '/pathfinder/api/activity?limit=120',
    };
    const url = endpoints[table];
    if (!url) {
      alert(`Export for pathfinder.${table} ships in Phase 2.`);
      return;
    }
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      alert(`Export failed: ${res.status}`);
      return;
    }
    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) {
      alert('No rows.');
      return;
    }
    const csv = toCsv(data);
    triggerDownload(`pathfinder_${table}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };
  return <Button variant="ghost" onClick={onClick}>Export CSV</Button>;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const cols = Array.from(
    rows.reduce<Set<string>>((s, r) => {
      Object.keys(r).forEach((k) => s.add(k));
      return s;
    }, new Set<string>()),
  );
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
