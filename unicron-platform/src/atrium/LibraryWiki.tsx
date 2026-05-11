// LibraryWiki.tsx — Sprint 6 Stream C
// Atrium Library > Wiki sub-view.
//
// Index-first pattern: renders _master-index.md on load (Addendum 2 §2.4).
// Left sidebar: nested page list grouped by top-level directory.
// Main area: markdown content with [[wikilink]] → internal link conversion.
// Edit button appears for pages with frontmatter editable: open.
// "Propose edit" appears for editable: pr.

import { useState, useEffect, useCallback } from 'react';
import type { WikiPage, WikiPageContent } from './library/useWikiApi';
import { fetchWikiIndex, fetchWikiPage, editWikiPage } from './library/useWikiApi';

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function PencilIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function PlusIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Text-size selector ───────────────────────────────────────────────────────
// Three-way toggle that scales body text + headings inside the wiki document
// viewer only. Persists across page reloads and tab navigation.

const TEXT_SIZE_STORAGE_KEY = 'atrium:library:textSize';
type LibraryTextSize = 'small' | 'medium' | 'large';
const TEXT_SIZE_OPTIONS: LibraryTextSize[] = ['small', 'medium', 'large'];

function readPersistedTextSize(): LibraryTextSize {
  if (typeof window === 'undefined') return 'medium';
  try {
    const v = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    if (v === 'small' || v === 'medium' || v === 'large') return v;
  } catch {
    // localStorage may be unavailable (private mode / SSR)
  }
  return 'medium';
}

function writePersistedTextSize(size: LibraryTextSize): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // best effort
  }
}

// ── Simple markdown renderer ─────────────────────────────────────────────────
// No external dep (react-markdown not in package.json).
// Converts headings, bold, inline code, code blocks, links, [[wikilinks]], lists.

function convertWikilinks(md: string): string {
  // [[wikilink]] → clickable anchor handled via event delegation in JSX
  return md.replace(/\[\[([^\]]+)\]\]/g, (_match, target: string) => {
    // Convert wiki/foo/bar → foo/bar slug (strip leading wiki/)
    const slug = target.replace(/^wiki\//, '');
    return `<wikilink data-slug="${slug}">${target.split('/').pop()}</wikilink>`;
  });
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\s*\n?/, '');
}

function renderMarkdown(raw: string): string {
  let md = stripFrontmatter(raw);

  // Code blocks (must come before inline code)
  md = md.replace(/```[\w]*\n?([\s\S]*?)```/g, (_m, code: string) =>
    `<pre class="code-block"><code>${escapeHtml(code.trimEnd())}</code></pre>`
  );

  // Bold
  md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  md = md.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  md = md.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Horizontal rule
  md = md.replace(/^---$/gm, '<hr class="hr-rule" />');

  // Tables
  md = md.replace(/((?:\|.+\|\n)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    const cells = rows.map((r) =>
      r.split('|').filter((_c, i, a) => i > 0 && i < a.length - 1).map((cell) => cell.trim())
    );
    const header = cells[0];
    const body = cells.slice(2); // skip separator row
    const thRow = header.map((h) => `<th>${h}</th>`).join('');
    const bodyRows = body.map(
      (row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`
    ).join('');
    return `<table class="md-table"><thead><tr>${thRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  });

  // Headings
  md = md.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes: string, text: string) => {
    const level = hashes.length;
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<h${level} id="${id}" class="md-h${level}">${text}</h${level}>`;
  });

  // Unordered lists
  md = md.replace(/((?:^[ \t]*[-*]\s.+\n?)+)/gm, (block) => {
    const items = block.split('\n').filter((l) => l.trim().match(/^[-*]\s/));
    return (
      '<ul class="md-ul">' +
      items.map((l) => `<li>${l.replace(/^[ \t]*[-*]\s/, '')}</li>`).join('') +
      '</ul>\n'
    );
  });

  // Checkboxes
  md = md.replace(/- \[x\] /gi, '- <span class="check done">✓</span> ');
  md = md.replace(/- \[ \] /g, '- <span class="check todo">○</span> ');

  // Links [text](url)
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener">$1</a>');

  // Paragraphs — wrap lone lines
  md = md
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '';
      if (line.match(/^<(h[1-6]|ul|pre|table|hr|li)/)) return line;
      if (line.match(/^<\//)) return line;
      return `<p class="md-p">${line}</p>`;
    })
    .join('\n');

  return md;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractToc(raw: string): { id: string; text: string; level: number }[] {
  const toc: { id: string; text: string; level: number }[] = [];
  const body = stripFrontmatter(raw);
  for (const match of body.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    toc.push({ id, text, level });
  }
  return toc;
}

// ── Curated handbook structure ────────────────────────────────────────────────
// Library tab is the employee handbook surface. Only root-level handbook pages
// appear in the sidebar; everything else (wiki/architecture, wiki/specs,
// wiki/prds, wiki/prompts, wiki/plans, wiki/memory, wiki/retros, wiki/_archive,
// _-prefixed system files) is filtered out of the listing. Pages outside the
// handbook are still reachable via direct slug or wikilink — they just don't
// surface in the new-teammate handbook navigation.

interface HandbookSection {
  label: string;
  slugs: string[];
}

const HANDBOOK_SECTIONS: HandbookSection[] = [
  { label: 'Welcome',      slugs: ['welcome', 'what-this-is'] },
  { label: 'How it works', slugs: ['how-it-works', 'how-you-participate', 'whats-connected'] },
  { label: 'Onboarding',   slugs: ['quick-start', 'adding-a-team-member'] },
  { label: 'Day-to-day',   slugs: ['best-practices', 'editing-the-system'] },
  { label: 'Reference',    slugs: ['glossary', 'faq'] },
];

interface NavNode {
  page: WikiPage;
  children: NavNode[];
}

interface NavSection {
  label: string;
  nodes: NavNode[];
}

// Build a 3-level handbook nav:
//  1. Curated sections (HANDBOOK_SECTIONS) with their root pages
//  2. Each root page may have nested children (slug starts with `<parent>/`).
//     Children recurse — sub-pages can have sub-sub-pages.
//  3. An "Other" section at the bottom collects root-level pages that are NOT
//     in HANDBOOK_SECTIONS and are NOT system files (_-prefixed, architecture,
//     specs, prds, etc.). This is where pages added via the "+ New page"
//     affordance land by default.
function buildHandbookNav(pages: WikiPage[]): NavSection[] {
  const EXCLUDED_TOP_DIRS = new Set([
    'architecture', 'specs', 'prds', 'prompts', 'plans', 'retros', 'memory',
    '_archive', 'research', 'decisions', 'people', 'customers', 'outputs', 'raw',
  ]);

  const isHandbookCandidate = (slug: string): boolean => {
    if (slug.startsWith('_')) return false;
    const top = slug.split('/')[0];
    if (EXCLUDED_TOP_DIRS.has(top)) return false;
    return true;
  };

  const handbookPages = pages.filter((p) => isHandbookCandidate(p.slug));
  const bySlug = new Map(handbookPages.map((p) => [p.slug, p]));

  // Build child lookup: parent slug -> direct children (depth = 1 below parent)
  const childrenOf = new Map<string, WikiPage[]>();
  for (const page of handbookPages) {
    const lastSlash = page.slug.lastIndexOf('/');
    if (lastSlash < 0) continue;
    const parent = page.slug.slice(0, lastSlash);
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(page);
  }

  const buildNode = (page: WikiPage): NavNode => ({
    page,
    children: (childrenOf.get(page.slug) ?? [])
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(buildNode),
  });

  const claimedSlugs = new Set<string>();
  const markClaimed = (node: NavNode): void => {
    claimedSlugs.add(node.page.slug);
    node.children.forEach(markClaimed);
  };

  const curated: NavSection[] = HANDBOOK_SECTIONS.map((section) => {
    const nodes = section.slugs
      .map((slug) => bySlug.get(slug))
      .filter((p): p is WikiPage => p !== undefined)
      .map(buildNode);
    nodes.forEach(markClaimed);
    return { label: section.label, nodes };
  }).filter((s) => s.nodes.length > 0);

  // "Other" — root-level handbook pages not in any curated section
  const otherRootPages = handbookPages
    .filter((p) => !p.slug.includes('/') && !claimedSlugs.has(p.slug))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(buildNode);

  if (otherRootPages.length > 0) {
    curated.push({ label: 'Other', nodes: otherRootPages });
  }

  return curated;
}

// Slug derivation: kebab-case, ASCII-only, strip non-alphanum
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function newPageSeed(title: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `---
title: "${title.replace(/"/g, '\\"')}"
type: wiki
editable: open
date: ${today}
status: draft
---

# ${title}

`;
}

// ── NavRow — sidebar entry with edit/add-child affordances ────────────────────

function NavRow({
  node,
  depth,
  selectedSlug,
  onSelect,
  onAddChild,
}: {
  node: NavNode;
  depth: number;
  selectedSlug: string;
  onSelect: (slug: string) => void;
  onAddChild: (parentSlug: string) => void;
}) {
  const isActive = selectedSlug === node.page.slug;
  return (
    <>
      <div
        className={['library-sidebar-row', isActive ? 'is-active' : ''].join(' ').trim()}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <button
          type="button"
          onClick={() => onSelect(node.page.slug)}
          className="library-sidebar-row-link"
          title={node.page.slug}
        >
          {node.page.title}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddChild(node.page.slug); }}
          className="library-sidebar-row-icon"
          aria-label={`Add sub-page under ${node.page.title}`}
          title="Add sub-page"
        >
          <PlusIcon size={11} />
        </button>
      </div>
      {node.children.map((child) => (
        <NavRow
          key={child.page.slug}
          node={child}
          depth={depth + 1}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          onAddChild={onAddChild}
        />
      ))}
    </>
  );
}

// ── New page modal ────────────────────────────────────────────────────────────

function NewPageModal({
  parentSlug,
  onCancel,
  onSubmit,
}: {
  parentSlug: string;
  onCancel: () => void;
  onSubmit: (title: string, slug: string, parent: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugifyTitle(title);
  const fullSlug = parentSlug ? `${parentSlug}/${effectiveSlug}` : effectiveSlug;
  const canSubmit = title.trim().length > 0 && effectiveSlug.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(title.trim(), effectiveSlug, parentSlug);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="library-modal-backdrop" onClick={onCancel}>
      <form
        className="library-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="library-modal-header">
          {parentSlug ? `New sub-page under ${parentSlug}` : 'New page'}
        </div>

        <label className="library-modal-field">
          <span className="library-modal-label">Title</span>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Working with the Orchestrator"
            className="library-modal-input"
            spellCheck
          />
        </label>

        <label className="library-modal-field">
          <span className="library-modal-label">Slug</span>
          <input
            type="text"
            value={effectiveSlug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
            placeholder="working-with-the-orchestrator"
            className="library-modal-input library-modal-input-mono"
            spellCheck={false}
          />
          <span className="library-modal-hint">Path: <code>{fullSlug || '(empty)'}</code></span>
        </label>

        {error && <div className="library-modal-error">{error}</div>}

        <div className="library-modal-actions">
          <button type="button" onClick={onCancel} className="library-modal-btn">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} className="library-modal-btn library-modal-btn-primary">
            {submitting ? 'Creating…' : 'Create page'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LibraryWiki({ initialSlug }: { initialSlug?: string } = {}) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(initialSlug ?? '_master-index');
  const [pageContent, setPageContent] = useState<WikiPageContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [textSize, setTextSizeState] = useState<LibraryTextSize>(() => readPersistedTextSize());

  // New-page modal — null when closed, parent="" for top-level, otherwise sub-page parent slug
  const [newPageParent, setNewPageParent] = useState<string | null>(null);

  const setTextSize = (size: LibraryTextSize) => {
    setTextSizeState(size);
    writePersistedTextSize(size);
  };

  const refreshIndex = useCallback(async (): Promise<WikiPage[]> => {
    const ps = await fetchWikiIndex();
    setPages(ps);
    return ps;
  }, []);

  // Load index
  useEffect(() => {
    refreshIndex()
      .then(() => setLoading(false))
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [refreshIndex]);

  // Load page content
  const loadPage = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setEditing(false);
    setSaveMsg(null);
    setContentLoading(true);
    fetchWikiPage(slug)
      .then((c) => {
        setPageContent(c);
        setContentLoading(false);
      })
      .catch((e: Error) => {
        setPageContent({ slug, content: `> Error loading page: ${e.message}`, mtime: null });
        setContentLoading(false);
      });
  }, []);

  // Load initial page on mount (index-first: default to _master-index)
  useEffect(() => {
    loadPage(initialSlug ?? '_master-index');
  // loadPage is stable; initialSlug drives the initial load only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handbookNav = buildHandbookNav(pages);
  const currentPage = pages.find((p) => p.slug === selectedSlug);
  const editability = currentPage?.frontmatter?.editable ?? 'auto';
  const toc = pageContent ? extractToc(pageContent.content) : [];

  const handleSave = async () => {
    if (!pageContent) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await editWikiPage(selectedSlug, editDraft);
      setPageContent({ ...pageContent, content: editDraft });
      setEditing(false);
      setSaveMsg('Saved and committed.');
    } catch (e: unknown) {
      setSaveMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePage = useCallback(async (title: string, slugInput: string, parentSlug: string): Promise<void> => {
    const childSlug = slugInput.trim() || slugifyTitle(title);
    if (!childSlug) throw new Error('Slug cannot be empty');
    const fullSlug = parentSlug ? `${parentSlug}/${childSlug}` : childSlug;
    if (pages.some((p) => p.slug === fullSlug)) {
      throw new Error(`A page with slug "${fullSlug}" already exists`);
    }
    const seed = newPageSeed(title);
    await editWikiPage(fullSlug, seed);
    await refreshIndex();
    setSelectedSlug(fullSlug);
    setPageContent({ slug: fullSlug, content: seed, mtime: null });
    setEditDraft(seed);
    setEditing(true);
    setNewPageParent(null);
    setSaveMsg(null);
  }, [pages, refreshIndex]);

  // Handle [[wikilink]] clicks via event delegation
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const wikilinkEl = target.closest('wikilink');
    if (wikilinkEl) {
      e.preventDefault();
      const slug = wikilinkEl.getAttribute('data-slug');
      if (slug) loadPage(slug);
    }
  };

  return (
    <div className="flex gap-4 min-h-[600px]" style={{ maxWidth: '100%' }}>
      {/* Sidebar */}
      <aside
        className="shrink-0 border-r border-border-default pr-4 overflow-y-auto"
        style={{ width: sidebarOpen ? 220 : 32, transition: 'width 0.2s ease', minHeight: 400 }}
      >
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="library-sidebar-toggle"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? '← Hide' : '→'}
        </button>

        {sidebarOpen && loading && (
          <div className="library-sidebar-meta animate-pulse">Loading…</div>
        )}
        {sidebarOpen && error && (
          <div className="library-sidebar-meta" style={{ color: 'var(--v3-red)' }}>{error}</div>
        )}

        {sidebarOpen && !loading && (
          <>
            {/* _master-index first */}
            <button
              onClick={() => loadPage('_master-index')}
              className={[
                'library-sidebar-link',
                selectedSlug === '_master-index' ? 'is-active' : '',
              ].join(' ').trim()}
            >
              Index
            </button>

            {handbookNav.map(({ label, nodes }) => (
              <div key={label} className="library-sidebar-section">
                <div className="library-sidebar-section-label">{label}</div>
                {nodes.map((node) => (
                  <NavRow
                    key={node.page.slug}
                    node={node}
                    depth={0}
                    selectedSlug={selectedSlug}
                    onSelect={loadPage}
                    onAddChild={(parent) => setNewPageParent(parent)}
                  />
                ))}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setNewPageParent('')}
              className="library-new-page-btn"
              title="Create a new top-level page"
            >
              <PlusIcon size={11} />
              <span>New page</span>
            </button>
          </>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex gap-4">
        <div className="flex-1 min-w-0">
          {/* Page header */}
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <div className="library-page-path truncate">{selectedSlug}</div>
              {pageContent?.mtime && (
                <div className="library-page-mtime">
                  Modified {pageContent.mtime.slice(0, 10)}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0 items-center">
              {/* Text-size selector: small / medium / large */}
              <div className="library-textsize-group" role="group" aria-label="Document text size">
                {TEXT_SIZE_OPTIONS.map((size) => {
                  const fontPx = size === 'small' ? 11 : size === 'medium' ? 13 : 16;
                  const selected = textSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTextSize(size)}
                      aria-label={`Text size ${size}`}
                      aria-pressed={selected}
                      title={`Text size: ${size}`}
                      className={['library-textsize-btn', selected ? 'is-selected' : ''].join(' ').trim()}
                    >
                      <span style={{ fontSize: fontPx, lineHeight: 1, fontWeight: 600 }}>A</span>
                    </button>
                  );
                })}
              </div>
              {!editing && pageContent && selectedSlug !== '_master-index' && (
                <button
                  type="button"
                  onClick={() => {
                    setEditDraft(pageContent.content);
                    setEditing(true);
                    setSaveMsg(null);
                  }}
                  className="library-page-icon-btn"
                  aria-label={editability === 'pr' ? 'Propose edit to this page' : 'Edit this page'}
                  title={editability === 'pr' ? 'Propose edit' : 'Edit'}
                >
                  <PencilIcon size={14} />
                </button>
              )}
              {editing && (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded border border-[rgba(232,118,58,0.4)] text-[#E8763A] hover:border-[#E8763A] transition-colors disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setSaveMsg(null);
                    }}
                    className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded border border-border-default text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {saveMsg && (
            <div
              className={[
                'mono text-[10px] px-3 py-2 rounded mb-4',
                saveMsg.startsWith('Error') ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10',
              ].join(' ')}
            >
              {saveMsg}
            </div>
          )}

          {/* Editor or rendered content */}
          {editing ? (
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="w-full min-h-[500px] bg-bg-raised border border-border-default rounded p-4 mono text-[11px] text-text-primary resize-y focus:outline-none focus:border-border-strong"
              spellCheck={false}
            />
          ) : contentLoading ? (
            <div className="mono text-[11px] text-text-secondary animate-pulse">Loading…</div>
          ) : pageContent ? (
            // eslint-disable-next-line react/no-danger
            <div
              className="wiki-content"
              data-text-size={textSize}
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{
                __html: convertWikilinks(renderMarkdown(pageContent.content)),
              }}
            />
          ) : null}
        </div>

        {newPageParent !== null && (
          <NewPageModal
            parentSlug={newPageParent}
            onCancel={() => setNewPageParent(null)}
            onSubmit={handleCreatePage}
          />
        )}

        {/* Table of contents */}
        {!editing && toc.length > 0 && (
          <aside className="hidden xl:block w-44 shrink-0">
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.3)] mb-2">
              Contents
            </div>
            <nav className="flex flex-col gap-0.5">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={[
                    'mono text-[10px] text-text-secondary hover:text-text-primary truncate',
                    item.level === 3 ? 'pl-3' : '',
                  ].join(' ')}
                >
                  {item.text}
                </a>
              ))}
            </nav>
          </aside>
        )}
      </div>

      {/* Inline styles for markdown rendering + library chrome */}
      <style>{`
        /* ── Sidebar (file tree) — Geist sans, v3 active state ── */
        .library-sidebar-toggle {
          font-family: var(--font-ui);
          font-size: 11px;
          letter-spacing: 0.02em;
          color: var(--v3-ink-lo);
          margin-bottom: 12px;
          display: block;
          transition: color 120ms ease;
        }
        .library-sidebar-toggle:hover { color: var(--v3-ink); }

        .library-sidebar-meta {
          font-family: var(--font-ui);
          font-size: 12px;
          color: var(--v3-ink-lo);
        }

        .library-sidebar-section { margin-bottom: 14px; }
        .library-sidebar-section-label {
          font-family: var(--font-ui);
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--v3-ink-lo);
          padding: 0 8px;
          margin-bottom: 4px;
        }

        .library-sidebar-link {
          display: block;
          width: 100%;
          text-align: left;
          padding: 6px 8px;
          border-radius: 4px;
          margin-bottom: 1px;
          font-family: var(--font-ui);
          font-size: 13px;
          line-height: 1.4;
          color: var(--v3-ink-md);
          background: transparent;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: background-color 100ms ease, color 100ms ease;
        }
        .library-sidebar-link:hover {
          background: var(--v3-line-soft);
          color: var(--v3-ink);
        }
        .library-sidebar-link.is-active {
          background: var(--v3-blue-soft);
          color: var(--v3-blue);
          font-weight: 600;
        }

        /* ── Sidebar nav rows with inline edit/add icons ── */
        .library-sidebar-row {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 0 8px 0 6px;
          border-radius: 4px;
          margin-bottom: 1px;
          transition: background-color 100ms ease, color 100ms ease;
        }
        .library-sidebar-row:hover {
          background: var(--v3-line-soft);
        }
        .library-sidebar-row.is-active {
          background: var(--v3-blue-soft);
        }
        .library-sidebar-row.is-active .library-sidebar-row-link {
          color: var(--v3-blue);
          font-weight: 600;
        }
        .library-sidebar-row-link {
          flex: 1 1 auto;
          min-width: 0;
          text-align: left;
          padding: 6px 0;
          font-family: var(--font-ui);
          font-size: 13px;
          line-height: 1.4;
          color: var(--v3-ink-md);
          background: transparent;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 100ms ease;
        }
        .library-sidebar-row:hover .library-sidebar-row-link {
          color: var(--v3-ink);
        }
        .library-sidebar-row-icon {
          flex: 0 0 auto;
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
          color: var(--v3-ink-lo);
          background: transparent;
          opacity: 0;
          transition: opacity 100ms ease, color 100ms ease, background-color 100ms ease;
        }
        .library-sidebar-row:hover .library-sidebar-row-icon,
        .library-sidebar-row.is-active .library-sidebar-row-icon {
          opacity: 1;
        }
        .library-sidebar-row-icon:hover {
          color: var(--v3-ink);
          background: var(--v3-bg-soft);
        }

        /* "+ New page" button at sidebar bottom */
        .library-new-page-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 6px 10px;
          border-radius: 4px;
          font-family: var(--font-ui);
          font-size: 12px;
          color: var(--v3-ink-lo);
          background: transparent;
          border: 1px dashed var(--v3-line);
          cursor: pointer;
          transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
        }
        .library-new-page-btn:hover {
          color: var(--v3-ink);
          border-color: var(--v3-line-strong);
          background: var(--v3-bg-soft);
        }

        /* Page header pencil/edit icon button */
        .library-page-icon-btn {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          color: var(--v3-ink-lo);
          background: transparent;
          border: 1px solid var(--v3-line-soft);
          cursor: pointer;
          transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
        }
        .library-page-icon-btn:hover {
          color: var(--v3-ink);
          border-color: var(--v3-line);
          background: var(--v3-bg-soft);
        }

        /* ── New page modal ── */
        .library-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }
        .library-modal {
          background: var(--v3-bg);
          border: 1px solid var(--v3-line);
          border-radius: 8px;
          padding: 20px 22px 16px;
          width: min(440px, 92vw);
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
        }
        .library-modal-header {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 600;
          color: var(--v3-ink);
          letter-spacing: -0.01em;
        }
        .library-modal-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .library-modal-label {
          font-family: var(--font-ui);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--v3-ink-lo);
        }
        .library-modal-input {
          font-family: var(--font-ui);
          font-size: 13px;
          color: var(--v3-ink);
          background: var(--v3-bg-soft);
          border: 1px solid var(--v3-line);
          border-radius: 4px;
          padding: 8px 10px;
          outline: none;
          transition: border-color 120ms ease;
        }
        .library-modal-input:focus { border-color: var(--v3-blue); }
        .library-modal-input-mono { font-family: var(--font-mono); font-size: 12px; }
        .library-modal-hint {
          font-family: var(--font-ui);
          font-size: 11px;
          color: var(--v3-ink-lo);
        }
        .library-modal-hint code {
          font-family: var(--font-mono);
          color: var(--v3-ink-md);
        }
        .library-modal-error {
          font-family: var(--font-ui);
          font-size: 12px;
          color: var(--v3-red);
          background: rgba(220, 70, 70, 0.08);
          border: 1px solid rgba(220, 70, 70, 0.25);
          border-radius: 4px;
          padding: 6px 10px;
        }
        .library-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 4px;
        }
        .library-modal-btn {
          font-family: var(--font-ui);
          font-size: 12px;
          padding: 7px 14px;
          border-radius: 4px;
          background: transparent;
          border: 1px solid var(--v3-line);
          color: var(--v3-ink-md);
          cursor: pointer;
          transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
        }
        .library-modal-btn:hover {
          color: var(--v3-ink);
          border-color: var(--v3-line-strong);
        }
        .library-modal-btn-primary {
          background: var(--v3-blue);
          border-color: var(--v3-blue);
          color: #fff;
        }
        .library-modal-btn-primary:hover {
          background: var(--v3-blue-ink, var(--v3-blue));
          border-color: var(--v3-blue-ink, var(--v3-blue));
          color: #fff;
        }
        .library-modal-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ── Document viewer header chrome ── */
        .library-page-path {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--v3-ink-md);
        }
        .library-page-mtime {
          font-family: var(--font-ui);
          font-size: 10px;
          color: var(--v3-ink-lo);
          margin-top: 2px;
        }

        /* ── Text-size selector ── */
        .library-textsize-group {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          padding: 2px;
          border-radius: 6px;
          background: transparent;
          margin-right: 4px;
        }
        .library-textsize-btn {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          color: var(--v3-ink-lo);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background-color 100ms ease, color 100ms ease;
        }
        .library-textsize-btn:hover { color: var(--v3-ink); }
        .library-textsize-btn.is-selected {
          background: var(--v3-bg-soft);
          color: var(--v3-ink);
        }

        /* ── Wiki document content ── */
        .wiki-content {
          --lib-scale: 1;
          font-family: var(--font-ui);
          color: var(--v3-ink);
          max-width: 78ch;
        }
        .wiki-content[data-text-size="small"]  { --lib-scale: 0.875; }
        .wiki-content[data-text-size="medium"] { --lib-scale: 1; }
        .wiki-content[data-text-size="large"]  { --lib-scale: 1.125; }

        .wiki-content wikilink {
          color: var(--v3-blue);
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
          font-family: var(--font-ui);
        }
        .wiki-content wikilink:hover { opacity: 0.8; }

        .wiki-content .md-h1 {
          font-family: var(--font-display);
          font-size: calc(30px * var(--lib-scale));
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.15;
          margin: 1.4em 0 0.5em;
          color: var(--v3-ink);
        }
        .wiki-content .md-h2 {
          font-family: var(--font-display);
          font-size: calc(22px * var(--lib-scale));
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.2;
          margin: 1.2em 0 0.4em;
          color: var(--v3-ink);
          padding-bottom: 0.25em;
          border-bottom: 1px solid var(--v3-line-soft);
        }
        .wiki-content .md-h3 {
          font-family: var(--font-display);
          font-size: calc(19px * var(--lib-scale));
          font-weight: 600;
          line-height: 1.25;
          margin: 1em 0 0.3em;
          color: var(--v3-ink);
        }
        .wiki-content .md-h4,
        .wiki-content .md-h5,
        .wiki-content .md-h6 {
          font-family: var(--font-display);
          font-size: calc(16px * var(--lib-scale));
          font-weight: 600;
          line-height: 1.3;
          margin: 0.8em 0 0.2em;
          color: var(--v3-ink-md);
        }
        .wiki-content .md-p {
          font-family: var(--font-ui);
          font-size: calc(16px * var(--lib-scale));
          line-height: 1.55;
          color: var(--v3-ink);
          margin: 0.55em 0;
        }
        .wiki-content .md-ul {
          list-style: disc;
          padding-left: 1.4em;
          margin: 0.55em 0;
        }
        .wiki-content .md-ul li {
          font-family: var(--font-ui);
          font-size: calc(16px * var(--lib-scale));
          line-height: 1.55;
          color: var(--v3-ink);
          margin: 0.2em 0;
        }
        .wiki-content strong { font-weight: 600; color: var(--v3-ink); }
        .wiki-content em { font-style: italic; }

        .wiki-content .inline-code {
          background: var(--v3-line-soft);
          color: var(--v3-ink-md);
          padding: 1px 6px;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 0.9em;
        }
        .wiki-content .code-block {
          background: var(--v3-bg-soft);
          border: 1px solid var(--v3-line);
          border-radius: 6px;
          padding: 0.85em 1em;
          margin: 0.85em 0;
          overflow-x: auto;
        }
        .wiki-content .code-block code {
          font-family: var(--font-mono);
          font-size: calc(13px * var(--lib-scale));
          line-height: 1.55;
          color: var(--v3-ink);
          white-space: pre;
        }

        .wiki-content .md-link {
          color: var(--v3-blue);
          text-decoration: underline;
          text-underline-offset: 2px;
          font-size: inherit;
          font-family: inherit;
        }
        .wiki-content .md-link:hover { color: var(--v3-blue-ink); opacity: 0.8; }

        .wiki-content .hr-rule {
          border: none;
          border-top: 1px solid var(--v3-line-soft);
          margin: 1em 0;
        }
        .wiki-content .check.done { color: var(--v3-green); }
        .wiki-content .check.todo { color: var(--v3-ink-lo); }

        .wiki-content .md-table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.8em 0;
          font-family: var(--font-ui);
          font-size: calc(14px * var(--lib-scale));
        }
        .wiki-content .md-table th {
          border: 1px solid var(--v3-line);
          padding: 0.5em 0.7em;
          color: var(--v3-ink-md);
          text-align: left;
          font-weight: 600;
          background: var(--v3-bg-soft);
        }
        .wiki-content .md-table td {
          border: 1px solid var(--v3-line);
          padding: 0.5em 0.7em;
          color: var(--v3-ink);
        }
      `}</style>
    </div>
  );
}
