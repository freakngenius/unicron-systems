// src/atrium/library/useWikiApi.ts — Sprint 6 Stream C
// Typed fetch helpers for the wiki API endpoints.

export interface WikiPage {
  slug: string;
  title: string;
  path: string;
  frontmatter: Record<string, string>;
}

export interface WikiPageContent {
  slug: string;
  content: string;
  mtime: string | null;
}

export interface SearchResult {
  slug: string;
  title: string;
  path: string;
  excerpt: string;
  tags: string[];
  created_at: string | null;
}

const BASE = '/api/atrium';

export async function fetchWikiIndex(): Promise<WikiPage[]> {
  const res = await fetch(`${BASE}/wiki`);
  if (!res.ok) throw new Error(`wiki index: ${res.status}`);
  const data = (await res.json()) as { pages: WikiPage[] };
  return data.pages;
}

export async function fetchWikiPage(slug: string): Promise<WikiPageContent> {
  const encodedSlug = slug.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE}/wiki/${encodedSlug}`);
  if (!res.ok) throw new Error(`wiki page (${slug}): ${res.status}`);
  return (await res.json()) as WikiPageContent;
}

export async function searchVault(q: string, tags: string[] = []): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tags.length > 0) params.set('tags', tags.join(','));
  const qs = params.toString();
  const res = await fetch(`${BASE}/vault/search${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`vault search: ${res.status}`);
  const data = (await res.json()) as { results: SearchResult[] };
  return data.results;
}

export type TemplateType = 'prd' | 'spec' | 'prompt' | 'retro' | 'decision';

export async function instantiateTemplate(template: TemplateType): Promise<{ slug: string }> {
  const res = await fetch(`${BASE}/vault/templates/instantiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? `instantiate: ${res.status}`);
  }
  return (await res.json()) as { slug: string };
}

export async function editWikiPage(
  slug: string,
  content: string,
  author = 'atrium-user',
): Promise<{ ok: boolean; committed: boolean }> {
  const encodedSlug = slug.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE}/wiki/edit/${encodedSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, author }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string; reason?: string };
    throw new Error(err.reason ?? err.error ?? `edit: ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; committed: boolean };
}
