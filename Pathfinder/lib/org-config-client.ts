'use client';

// lib/org-config-client.ts — browser-only hook for reading the per-org
// geography config via /api/org-config. Closes the P2 follow-up TODO
// where ProjectList was using a hardcoded 250mi constant; that constant
// now lives in pathfinder.org_geo_config (one row per org) and the
// client reads it at mount.
//
// Falls back to the spec defaults (250mi, USA + CAN) if the API or
// table is unavailable, so the dashboard never breaks.

import * as React from 'react';

interface OrgGeoConfig {
  org_id: string;
  max_supported_distance_miles: number;
  allowed_countries: string[];
}

const DEFAULT_CONFIG: OrgGeoConfig = {
  org_id: 'zedcor',
  max_supported_distance_miles: 250,
  allowed_countries: ['USA', 'CAN'],
};

interface UseOrgGeoConfigResult {
  config: OrgGeoConfig;
  loading: boolean;
}

export function useOrgGeoConfig(orgId = 'zedcor'): UseOrgGeoConfigResult {
  const [config, setConfig] = React.useState<OrgGeoConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let cancelled = false;
    const url = `/pathfinder/api/org-config?org=${encodeURIComponent(orgId)}`;
    fetch(url, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (
          data &&
          typeof data === 'object' &&
          typeof (data as { max_supported_distance_miles?: unknown }).max_supported_distance_miles === 'number'
        ) {
          setConfig({
            org_id: String((data as { org_id?: string }).org_id ?? orgId),
            max_supported_distance_miles: Number(
              (data as { max_supported_distance_miles: number }).max_supported_distance_miles,
            ),
            allowed_countries: Array.isArray((data as { allowed_countries?: unknown }).allowed_countries)
              ? ((data as { allowed_countries: string[] }).allowed_countries)
              : DEFAULT_CONFIG.allowed_countries,
          });
        }
      })
      .catch(() => {
        // Swallow — fall back to defaults.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { config, loading };
}
