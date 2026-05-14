import { useEffect, useState } from 'react';
import { listCustomerOrgs } from '../lib/customersClient';
import type { CustomerOrg } from '../lib/contracts/customers';
import { STATUS_LABEL, STATUS_TONE } from './customerStatus';

interface Props {
  onSelect: (org: CustomerOrg) => void;
}

export function CustomersView({ onSelect }: Props) {
  const [orgs, setOrgs] = useState<CustomerOrg[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCustomerOrgs()
      .then((rows) => {
        if (cancelled) return;
        setOrgs(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="px-6 py-8">
      <header className="flex items-baseline justify-between mb-6">
        <h1 className="mono text-[16px] tracking-wide text-text-primary">Customers</h1>
        <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          {orgs ? `${orgs.length} REGISTERED` : 'LOADING'}
        </span>
      </header>

      {error ? (
        <p data-testid="customers-error" className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400">
          {error}
        </p>
      ) : !orgs ? (
        <SkeletonGrid />
      ) : orgs.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="customers-grid"
        >
          {orgs.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                onClick={() => onSelect(org)}
                data-testid="customer-card"
                data-org-id={org.id}
                className="w-full text-left flex flex-col gap-3 border border-border-default rounded-md bg-bg-panel p-4 hover:border-accent-gold/60 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="mono text-[13px] text-text-primary truncate"
                    data-testid="customer-card-name"
                  >
                    {org.display_name || `Customer ${org.id.slice(0, 8)}`}
                  </span>
                  <span
                    data-testid="customer-card-status"
                    data-status={org.status}
                    className={[
                      'mono text-[10px] uppercase tracking-[0.18em] border rounded-md px-2 py-0.5',
                      STATUS_TONE[org.status],
                    ].join(' ')}
                  >
                    {STATUS_LABEL[org.status]}
                  </span>
                </div>
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
                  onboarded {org.onboarded_at?.slice(0, 10) ?? '—'}
                </span>
                {org.primary_contact_email ? (
                  <span className="mono text-[10px] text-text-primary/40 truncate">
                    {org.primary_contact_email}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {orgs && orgs.length === 1 ? (
        <p
          data-testid="customers-single-tenant-note"
          className="mt-6 mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30"
        >
          Onboard another customer via the Architect to grow this list.
        </p>
      ) : null}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="customers-skeleton">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-24 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 border border-border-default border-dashed rounded-md bg-bg-panel py-16">
      <span className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary/50">
        no customers registered yet
      </span>
    </div>
  );
}
