'use client';

// components/catalog/CompanyDetailContext.tsx, Stream C Detail surface.
//
// Client-side React context carrying the per-page company data so the four
// catalog modules can read lead + project + architecture + per-slot mode
// without each module re-fetching. Provider is rendered by the server-side
// CatalogDetailRenderer.

import * as React from 'react';

import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';
import type { Slot } from '@/lib/catalog/types';

export type SlotMode = 'active' | 'inactive' | 'floor' | 'hidden';

export interface CompanyDetailContextValue {
  org: { id: string; slug: string; name: string };
  architecture: OrgArchitecture;
  lead: CompanyLeadView;
  project: Project;
  /** Per-slot mode so a module can render its active vs inactive variant. */
  slotMode: Partial<Record<Slot, SlotMode>>;
  /** Per-slot human-readable reason from the catalog renderer. */
  slotReason: Partial<Record<Slot, string>>;
}

const CompanyDetailContext = React.createContext<CompanyDetailContextValue | null>(null);

export function CompanyDetailProvider({
  value,
  children,
}: {
  value: CompanyDetailContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <CompanyDetailContext.Provider value={value}>
      {children}
    </CompanyDetailContext.Provider>
  );
}

export function useCompanyDetail(): CompanyDetailContextValue {
  const v = React.useContext(CompanyDetailContext);
  if (!v) {
    throw new Error(
      'useCompanyDetail must be used inside <CompanyDetailProvider>. ' +
        'A Stream C catalog module was rendered outside of CatalogDetailRenderer.',
    );
  }
  return v;
}
