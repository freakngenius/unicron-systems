// components/catalog/CatalogDetailRenderer.tsx, Stream C Detail surface.
//
// Server component that orchestrates the three Internal detail slots
// (detail.body, detail.outreach, detail.relationships). Calls
// resolveAllSlots from Stream A's renderer with a Supabase-backed gate
// context, then mounts each active/inactive slot's lazy-loaded module
// inside a client Provider that carries the lead + project + architecture
// + per-slot mode/reason for the modules to consume.
//
// Only mounted when architecture.modules is present (Internal today).
// Orgs without a modules block stay on the existing path through
// LeadDetailShell + CompanyDetailContents.

import * as React from 'react';

import { resolveAllSlots, makeSupabaseGateContext } from '@/lib/catalog';
import type { Slot, SlotResolution } from '@/lib/catalog/types';
import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';
import { supabaseAdmin } from '@/lib/supabase';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

import {
  CompanyDetailProvider,
  type CompanyDetailContextValue,
  type SlotMode,
} from './CompanyDetailContext';

void React;

interface Props {
  org: { id: string; slug: string; name: string };
  architecture: OrgArchitecture;
  lead: CompanyLeadView;
  project: Project;
}

const DETAIL_SLOTS: readonly Slot[] = ['detail.body', 'detail.outreach', 'detail.relationships'];

type LoadedModule = {
  resolution: SlotResolution;
  Component: React.ComponentType<import('@/lib/catalog/types').ModuleComponentProps> | null;
};

export async function CatalogDetailRenderer({
  org,
  architecture,
  lead,
  project,
}: Props): Promise<React.ReactElement> {
  const admin = supabaseAdmin() as unknown as { from: (t: string) => unknown };
  const gateContext = makeSupabaseGateContext(
    admin.from.bind(admin) as Parameters<typeof makeSupabaseGateContext>[0],
  );

  const resolved = await resolveAllSlots({
    org,
    architecture,
    gateContext,
  });

  const slotMode: Partial<Record<Slot, SlotMode>> = {};
  const slotReason: Partial<Record<Slot, string>> = {};
  for (const slot of DETAIL_SLOTS) {
    slotMode[slot] = resolved[slot].mode as SlotMode;
    slotReason[slot] = resolved[slot].reason;
  }

  const contextValue: CompanyDetailContextValue = {
    org,
    architecture,
    lead,
    project,
    slotMode,
    slotReason,
  };

  const loaded: Partial<Record<Slot, LoadedModule>> = {};
  for (const slot of DETAIL_SLOTS) {
    const res = resolved[slot];
    if ((res.mode === 'active' || res.mode === 'inactive') && res.module) {
      loaded[slot] = { resolution: res, Component: await loadComponent(res.module.component) };
    } else {
      loaded[slot] = { resolution: res, Component: null };
    }
  }

  return (
    <CompanyDetailProvider value={contextValue}>
      <div
        data-stream-c-renderer
        data-org-slug={org.slug}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {DETAIL_SLOTS.map((slot) => {
          const entry = loaded[slot];
          if (!entry?.Component) return null;
          const C = entry.Component;
          return (
            <C
              key={slot}
              org={org}
              architecture={architecture}
              config={entry.resolution.config}
              affordances={entry.resolution.affordances}
            />
          );
        })}
      </div>
    </CompanyDetailProvider>
  );
}

async function loadComponent(
  loader: import('@/lib/catalog/types').ModuleComponentLoader,
): Promise<React.ComponentType<import('@/lib/catalog/types').ModuleComponentProps>> {
  if (typeof loader === 'function') {
    const mod = await (loader as () => Promise<{
      default: React.ComponentType<import('@/lib/catalog/types').ModuleComponentProps>;
    }>)();
    return mod.default;
  }
  return loader as unknown as React.ComponentType<import('@/lib/catalog/types').ModuleComponentProps>;
}

export default CatalogDetailRenderer;
