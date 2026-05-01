// Settings persistence — backed by `unicron.settings` (Supabase) with a
// localStorage cache so the UI doesn't flash on reload.
//
// The migration that creates the table lives at:
//   Pathfinder/supabase/migrations/0090_unicron_settings.sql
//
// The `unicron` schema must be added to the project's
// "Exposed schemas" list (Supabase dashboard → Settings → API) for the
// PostgREST cross-schema query below to succeed.
//
// When auth is off (VITE_AUTH_REQUIRED=false), all reads/writes use the
// sentinel operator key 'anon-operator' so a single shared row is used in
// local dev — that's the documented contract on the migration's RLS policy.

import { getSupabase } from './supabase';

const LOCAL_KEY = 'unicron-platform.settings';
const ANON_KEY = 'anon-operator';

export type SettingsPayload = Record<string, unknown>;

export function loadLocal(): SettingsPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as SettingsPayload) : null;
  } catch {
    return null;
  }
}

export function saveLocal(payload: SettingsPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be full or denied (private mode). Swallow silently.
  }
}

export async function loadRemote(operatorKey: string | null): Promise<SettingsPayload | null> {
  const key = operatorKey ?? ANON_KEY;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema('unicron')
    .from('settings')
    .select('payload')
    .eq('operator_key', key)
    .maybeSingle();
  if (error) {
    console.warn('settings.loadRemote failed', error.message);
    return null;
  }
  return (data?.payload as SettingsPayload) ?? null;
}

export async function saveRemote(
  operatorKey: string | null,
  payload: SettingsPayload,
): Promise<void> {
  const key = operatorKey ?? ANON_KEY;
  const supabase = getSupabase();
  const { error } = await supabase
    .schema('unicron')
    .from('settings')
    .upsert({ operator_key: key, payload }, { onConflict: 'operator_key' });
  if (error) {
    console.warn('settings.saveRemote failed', error.message);
  }
}
