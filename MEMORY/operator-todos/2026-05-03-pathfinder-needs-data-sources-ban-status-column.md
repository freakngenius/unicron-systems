# Pathfinder follow-up — data_sources ban toggle endpoint + ingestion filter

**Filed by:** Wave 2 Stream W2-C (chore/wave2-source-ban)
**Date:** 2026-05-03
**Severity:** medium — UI half ships behind a feature flag and degrades gracefully; backend wire-up makes the ban actually take effect.

## What W2-C shipped

1. **Migration** (Pathfinder): `Pathfinder/supabase/migrations/0118_data_sources_ban_status.sql`
   - Adds `ban_status text not null default 'active' check (ban_status in ('active','banned'))` to `pathfinder.data_sources`.
   - Adds index `data_sources_ban_status_idx`.
   - Additive + idempotent. Safe to apply.

2. **Operator UI** (metacron): Source Onboarder result panel now shows a **BAN SOURCE / UNBAN SOURCE** toggle whenever `result.source_id` is present and the panel is not in `readOnly` mode.
   - File: `unicron-platform/src/components/agents/source-onboarder/SourceOnboarderResultPanel.tsx`.
   - Optimistic update with rollback on failure + visible error message.
   - Banned panel dims (opacity-60).

3. **Client** (metacron): `unicron-platform/src/lib/agents/sourcesClient.ts` — `toggleBan({ source_id, ban_status })`.
   - **Graceful fallback**: when `VITE_SOURCE_BAN_ENABLED !== 'true'` OR `VITE_PATHFINDER_API_URL` unset, returns an optimistic success without hitting the network. UI feels alive even before backend ships.
   - **Real mode**: `POST {VITE_PATHFINDER_API_URL}/api/sources/:id/ban-status` with body `{ ban_status }`.

## What's still needed in Pathfinder

### 1. Toggle endpoint

Add `Pathfinder/app/api/sources/[id]/ban-status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Body { ban_status: 'active' | 'banned' }

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  if (body.ban_status !== 'active' && body.ban_status !== 'banned') {
    return NextResponse.json({ error: 'invalid_ban_status' }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from('data_sources')
    .update({ ban_status: body.ban_status, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, source_id: params.id, ban_status: body.ban_status });
}
```

### 2. Ingestion-list filter

Currently no app-route code in `Pathfinder/app/**` selects from `data_sources` for active ingestion (verified via grep on commit `ec8eff0`). When ingestion call-sites land (Inngest functions, watchers, polling cron), they MUST add:

```ts
.eq('ban_status', 'active')
```

…to the `data_sources` select. Filed here so it's not silently missed.

### 3. Flip the env flags after deploy

After (1) ships and the migration is applied:

- `VITE_SOURCE_BAN_ENABLED=true`
- `VITE_PATHFINDER_API_URL=<pathfinder origin>`

…then the metacron client switches from optimistic-fallback to real mode automatically.

## Out of scope (Phase 2)

- Cascade-soft-delete of already-ingested rows from a banned source.
- Bulk ban / per-vertical / time-windowed ban.
- Audit history (who banned/unbanned, when, why).
