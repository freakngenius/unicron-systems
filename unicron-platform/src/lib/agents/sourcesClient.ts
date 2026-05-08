// sourcesClient — operator client for managing pathfinder.data_sources rows.
//
// Wave 2 Stream W2-C scope: ban / unban a source. Banned sources are
// excluded from active ingestion lists in Pathfinder.
//
// Backend contract (server-side proxy):
//   POST /api/internal/sources   { source_id, ban_status: 'active' | 'banned' }
//   Proxy forwards to Pathfinder POST /api/sources/:id/ban-status server-side.
//
// When `VITE_SOURCE_BAN_ENABLED` is not 'true', the client gracefully degrades:
// it returns a successful optimistic response without hitting the network so
// the UI half can ship ahead of the backend route. See
// MEMORY/operator-todos/2026-05-03-pathfinder-needs-data-sources-ban-status-column.md
// (filed by W2-C) for the backend wire-up follow-up.

import { getEnv } from '../env';

export type BanStatus = 'active' | 'banned';

export type ToggleBanRequest = {
  source_id: string;
  ban_status: BanStatus;
};

export type ToggleBanResponse = {
  ok: true;
  source_id: string;
  ban_status: BanStatus;
};

function realEnabled(): boolean {
  // Reads getEnv() so unit tests can stub via __resetEnvForTests.
  void getEnv();
  return (import.meta.env.VITE_SOURCE_BAN_ENABLED as string | undefined) === 'true';
}

export async function toggleBan(req: ToggleBanRequest): Promise<ToggleBanResponse> {
  if (!realEnabled()) {
    // Graceful UI-only fallback. The toggle still feels alive; the operator
    // sees the optimistic state. Backend ships in a follow-up PR.
    return { ok: true, source_id: req.source_id, ban_status: req.ban_status };
  }

  const res = await fetch('/api/internal/sources', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ source_id: req.source_id, ban_status: req.ban_status }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sources API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as ToggleBanResponse;
}
