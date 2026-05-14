// skillsApi — typed client wrapper for Stream B's /api/skills surface.
//
// Wraps the four endpoints Stream C reads from in Sprint 9:
//   GET  /api/skills?lifecycle_status=approved&scope=system|tenant
//   GET  /api/skills/:id            (returns SkillWithHistory)
//   POST /api/skills/search         (hybrid FTS + vector + RRF)
//   POST /api/skills/:id/invoke     (thin pass-through in Sprint 9)
//
// All requests go through the same auth-header helper used by Now.tsx. If
// Stream B's contract diverges from these shapes the integration test in
// __tests__/skillsApi.test.ts will catch it before the PR merges.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import type {
  ListSkillsParams,
  SearchSkillsBody,
  SearchSkillsResponse,
  Skill,
  SkillSearchResult,
  SkillWithHistory,
} from './types';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function buildQuery(params: ListSkillsParams): string {
  const sp = new URLSearchParams();
  const push = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, String(item)));
    else sp.append(k, String(v));
  };
  push('lifecycle_status', params.lifecycle_status);
  push('status', params.status);
  push('scope', params.scope);
  push('domain', params.domain);
  push('limit', params.limit);
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export async function listSkills(params: ListSkillsParams = {}): Promise<Skill[]> {
  const res = await fetch(`/api/skills${buildQuery(params)}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`listSkills failed (${res.status})`);
  }
  const json = (await res.json()) as Skill[] | { skills: Skill[] };
  // Stream B may return either a raw array or `{ skills: [] }`. Accept both.
  return Array.isArray(json) ? json : json.skills ?? [];
}

export async function getSkill(id: string): Promise<SkillWithHistory> {
  const res = await fetch(`/api/skills/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`getSkill failed (${res.status})`);
  }
  const json = (await res.json()) as SkillWithHistory;
  // Ensure `history` is always an array even if Stream B omits it.
  return { ...json, history: Array.isArray(json.history) ? json.history : [] };
}

export async function searchSkills(body: SearchSkillsBody): Promise<SearchSkillsResponse> {
  const res = await fetch('/api/skills/search', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`searchSkills failed (${res.status})`);
  }
  const json = (await res.json()) as Partial<SearchSkillsResponse>;
  return {
    query: json.query ?? body.query,
    results: Array.isArray(json.results) ? (json.results as SkillSearchResult[]) : [],
  };
}

/** Sprint 9: invoke is a thin pass-through. Stream B owns the request shape. */
export async function invokeSkill(
  id: string,
  inputs: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`/api/skills/${encodeURIComponent(id)}/invoke`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ inputs }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export interface UseSkillsListState {
  skills: Skill[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSkillsList(params: ListSkillsParams): UseSkillsListState {
  // Stable param key so identical-shape objects don't re-trigger fetches.
  const key = JSON.stringify(params);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    listSkills(params)
      .then((rows) => {
        if (cancelled) return;
        setSkills(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'unknown error');
        setSkills([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // params is captured via `key` to keep the effect re-run boundary stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { skills, loading, error, refetch: () => setNonce((n) => n + 1) };
}

export interface UseSkillState {
  skill: SkillWithHistory | null;
  loading: boolean;
  error: string | null;
}

export function useSkill(id: string | null): UseSkillState {
  const [skill, setSkill] = useState<SkillWithHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSkill(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSkill(id)
      .then((row) => {
        if (cancelled) return;
        setSkill(row);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'unknown error');
        setSkill(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { skill, loading, error };
}

export interface UseSkillsSearchState {
  results: SkillSearchResult[];
  loading: boolean;
  error: string | null;
}

/**
 * Run a hybrid skill search whenever `query` changes. An empty trimmed query
 * clears results and skips the network call. `enabled=false` also short-
 * circuits — useful when the Now tab hasn't gathered context yet.
 */
export function useSkillsSearch(
  query: string,
  options: { topK?: number; enabled?: boolean; scope?: 'system' | 'tenant' | 'any' } = {},
): UseSkillsSearchState {
  const { topK = 3, enabled = true, scope = 'any' } = options;
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || !trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchSkills({ query: trimmed, top_k: topK, scope, lifecycle_status: 'approved' })
      .then((resp) => {
        if (cancelled) return;
        setResults(resp.results);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'unknown error');
        setResults([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, topK, enabled, scope]);

  return { results, loading, error };
}
