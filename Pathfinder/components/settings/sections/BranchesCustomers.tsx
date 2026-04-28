'use client';

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { Branch, Customer } from '@/lib/types';
import { Card, Phase2Banner } from '../Field';

const API_BASE = '/pathfinder';

export function BranchesCustomersSection() {
  const [branches, setBranches] = React.useState<Branch[] | null>(null);
  const [customers, setCustomers] = React.useState<Customer[] | null>(null);

  React.useEffect(() => {
    void fetch(`${API_BASE}/api/branches`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setBranches)
      .catch(() => setBranches([]));
    void fetch(`${API_BASE}/api/customers`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  return (
    <>
      <Card
        title="Branches"
        description="Read-only view of pathfinder.branches. Editing + bulk import ship in Phase 2 — for the pilot, edits land via Supabase migrations."
      >
        <Table
          headers={['code', 'name', 'region', 'lat', 'lon', 'coverage']}
          rows={
            branches?.map((b) => [
              b.code,
              b.name,
              b.region ?? '—',
              b.lat.toFixed(3),
              b.lon.toFixed(3),
              `${b.coverage_radius_miles}mi`,
            ]) ?? null
          }
        />
      </Card>

      <Card
        title="Customers"
        description="Read-only view of pathfinder.customers. Same Phase 2 caveat as branches."
      >
        <Table
          headers={['name', 'served by', 'lat', 'lon', 'monthly value']}
          rows={
            customers?.map((c) => [
              c.name,
              c.served_by_branch_id ?? '—',
              c.lat.toFixed(3),
              c.lon.toFixed(3),
              c.monthly_value != null ? `$${c.monthly_value.toLocaleString()}` : '—',
            ]) ?? null
          }
        />
      </Card>

      <Card title="Bulk import (CSV)">
        <Phase2Banner note="CSV upload for branches + customers ships with the Zedcor production rollout when real data lands." />
      </Card>
    </>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] | null }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          font: `400 12px ${PF_TINTS.mono}`,
          color: PF_TINTS.ink,
        }}
      >
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '10px 18px',
                  font: `500 9px ${PF_TINTS.mono}`,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: PF_TINTS.inkDim,
                  borderBottom: `1px solid ${PF_TINTS.ruleSoft}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows === null ? (
            <tr>
              <td
                colSpan={headers.length}
                style={{ padding: '16px 18px', color: PF_TINTS.inkDim }}
              >
                loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                style={{ padding: '16px 18px', color: PF_TINTS.inkDim }}
              >
                no rows
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    style={{
                      padding: '10px 18px',
                      borderTop: `1px solid ${PF_TINTS.ruleHair}`,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
