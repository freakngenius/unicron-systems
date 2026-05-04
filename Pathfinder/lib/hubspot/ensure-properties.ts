// lib/hubspot/ensure-properties.ts — Gate 12F lazy-provisioning of the
// custom HubSpot deal properties Pathfinder writes on push.
//
// SPEC - HubSpot Bridge.md §Multi-tenant. Pathfinder writes
// `pathfinder_*` custom properties on every deal it pushes. HubSpot's
// schema is per-portal: a property has to exist on the customer's
// portal before any deal-create call can set its value, otherwise the
// API rejects the entire payload with PROPERTY_DOESNT_EXIST.
//
// For the per-user push (any customer connecting their own HubSpot),
// we cannot pre-provision the schema by hand. This module ensures the
// property group + each property exists on the portal before the first
// push, idempotently. Re-checks within a single request are short-
// circuited via an in-memory cache keyed by portal_id; a fresh process
// re-checks once per portal on the first push.
//
// Scope: deals only. Pathfinder writes only HubSpot-standard contact
// properties (email/firstname/lastname/phone/jobtitle/company), so
// contacts don't need provisioning. If that ever changes, mirror this
// module as ensure-contact-properties.ts.

import type { HubspotUserClient } from '@/lib/hubspot/user-client';
import { HubspotUserClientError } from '@/lib/hubspot/user-client';

const GROUP_NAME = 'pathfinderinformation';
const GROUP_LABEL = 'Pathfinder';

type HubspotPropertyType = 'string' | 'number' | 'enumeration' | 'date' | 'datetime' | 'bool';
type HubspotFieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'booleancheckbox';

interface PropertyDef {
  name: string;
  label: string;
  type: HubspotPropertyType;
  fieldType: HubspotFieldType;
  description: string;
}

/** The custom deal properties the per-user push (lib/hubspot/field-mapper.ts)
 *  may write. Keep in sync with `buildDealProperties()` — adding a property
 *  there without adding it here will reproduce the very bug this module
 *  was created to fix.
 *
 *  Naming + types match what HubSpot's properties API expects:
 *    - `type` is the canonical data type
 *    - `fieldType` controls the HubSpot UI rendering (single-line,
 *       multi-line, dropdown, etc.) */
export const PATHFINDER_DEAL_PROPERTIES: readonly PropertyDef[] = [
  {
    name: 'pathfinder_lead_id',
    label: 'Pathfinder Lead ID',
    type: 'string',
    fieldType: 'text',
    description: 'Pathfinder project id this deal originated from. Used for round-trip sync.',
  },
  {
    name: 'pathfinder_source_id',
    label: 'Pathfinder Source ID',
    type: 'string',
    fieldType: 'text',
    description: 'Upstream source identifier (e.g. "txdot:I45-2026-001") for the Pathfinder lead.',
  },
  {
    name: 'pathfinder_score',
    label: 'Pathfinder Score',
    type: 'number',
    fieldType: 'number',
    description: 'Pathfinder fit score for the originating lead, 0-100.',
  },
  {
    name: 'pathfinder_branch',
    label: 'Pathfinder Branch',
    type: 'string',
    fieldType: 'text',
    description: 'Nearest customer branch attached to the Pathfinder lead at push time.',
  },
  {
    name: 'pathfinder_industry',
    label: 'Pathfinder Industry',
    type: 'string',
    fieldType: 'text',
    description: 'NAICS description on the source project at push time.',
  },
] as const;

/** Per-portal cache. Keyed by portal_id; the value is a Promise so
 *  concurrent first-pushes within the same process collapse onto the
 *  same in-flight ensure call rather than firing it N times.
 *  Lifetime: process-local (Vercel function instance). Cold starts
 *  re-bootstrap on first push. */
const ensureCache = new Map<string, Promise<void>>();

/** Test-only cache reset. Production paths never call this. */
export function __resetEnsurePropertiesCacheForTests(): void {
  ensureCache.clear();
}

/** A 404 from HubSpot's properties API arrives as
 *  `HubspotUserClientError` with status 404 (the response body carries
 *  PROPERTY_DOESNT_EXIST or a similar errorType). Either signal counts. */
function isMissingError(err: unknown): boolean {
  if (!(err instanceof HubspotUserClientError)) return false;
  if (err.status === 404) return true;
  // Some HubSpot endpoints return 400 with PROPERTY_DOESNT_EXIST on
  // the GET path; tolerate it.
  return err.detail.includes('PROPERTY_DOESNT_EXIST');
}

/** A 409 indicates the property/group was created concurrently by
 *  another caller (another worker hit the same portal at the same
 *  time). For idempotent ensure semantics, treat as success. */
function isAlreadyExistsError(err: unknown): boolean {
  if (!(err instanceof HubspotUserClientError)) return false;
  if (err.status === 409) return true;
  // Older HubSpot deployments respond 400 with `PROPERTY_ALREADY_EXISTS`.
  return err.status === 400 && err.detail.includes('ALREADY_EXISTS');
}

async function ensureGroup(client: HubspotUserClient): Promise<void> {
  try {
    await client.request({
      method: 'GET',
      path: `/crm/v3/properties/deals/groups/${encodeURIComponent(GROUP_NAME)}`,
    });
    return;
  } catch (err) {
    if (!isMissingError(err)) throw err;
  }
  try {
    await client.request({
      method: 'POST',
      path: '/crm/v3/properties/deals/groups',
      body: {
        name: GROUP_NAME,
        label: GROUP_LABEL,
        displayOrder: -1,
      },
    });
  } catch (err) {
    if (isAlreadyExistsError(err)) return;
    throw err;
  }
}

async function ensureProperty(client: HubspotUserClient, def: PropertyDef): Promise<void> {
  try {
    await client.request({
      method: 'GET',
      path: `/crm/v3/properties/deals/${encodeURIComponent(def.name)}`,
    });
    return;
  } catch (err) {
    if (!isMissingError(err)) throw err;
  }
  try {
    await client.request({
      method: 'POST',
      path: '/crm/v3/properties/deals',
      body: {
        name: def.name,
        label: def.label,
        type: def.type,
        fieldType: def.fieldType,
        groupName: GROUP_NAME,
        description: def.description,
        formField: false,
      },
    });
  } catch (err) {
    if (isAlreadyExistsError(err)) return;
    throw err;
  }
}

/** Ensure the Pathfinder property group + every custom deal property
 *  exists on `portalId`'s HubSpot portal. Idempotent and cached
 *  per-portal for the duration of the process.
 *
 *  Throws on auth/scope failures so the caller can surface a clear
 *  reason without attempting the deal push (a 403 here means the
 *  user's connection lacks `crm.schemas.deals.write`; retrying the
 *  push won't help). */
export async function ensurePathfinderDealProperties(
  client: HubspotUserClient,
  portalId: string,
): Promise<void> {
  const cached = ensureCache.get(portalId);
  if (cached) return cached;

  const run = (async () => {
    try {
      await ensureGroup(client);
      // Sequential to keep the burst small + make any failure attributable
      // to a specific property name in error messages. The schema endpoints
      // are not rate-sensitive at this volume (5 calls per cold portal).
      for (const def of PATHFINDER_DEAL_PROPERTIES) {
        await ensureProperty(client, def);
      }
    } catch (err) {
      // On failure, evict so a retry on the next push gets a fresh attempt
      // (don't trap the portal in a stuck-failing state from a transient).
      ensureCache.delete(portalId);
      throw err;
    }
  })();
  ensureCache.set(portalId, run);
  return run;
}
