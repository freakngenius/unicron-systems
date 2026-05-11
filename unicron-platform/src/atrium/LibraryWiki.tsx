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

// ── Group pages by top-level directory ────────────────────────────────────────

function groupPages(pages: WikiPage[]): Record<string, WikiPage[]> {
  const grouped: Record<string, WikiPage[]> = {};
  for (const page of pages) {
    const parts = page.slug.split('/');
    const section = parts.length > 1 ? parts[0] : '_root';
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(page);
  }
  return grouped;
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

  // Load index
  useEffect(() => {
    fetchWikiIndex()
      .then((ps) => {
        setPages(ps);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

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

  const grouped = groupPages(pages);

  return (
    <div className="flex gap-4 min-h-[600px]" style={{ maxWidth: '100%' }}>
      {/* Sidebar */}
      <aside
        className="shrink-0 border-r border-[#1F1F23] pr-4 overflow-y-auto"
        style={{ width: sidebarOpen ? 220 : 32, transition: 'width 0.2s ease', minHeight: 400 }}
      >
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="mono text-[10px] uppercase tracking-[0.14em] text-text-secondary hover:text-text-primary mb-3 block"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? '← Hide' : '→'}
        </button>

        {sidebarOpen && loading && (
          <div className="mono text-[10px] text-text-secondary animate-pulse">Loading…</div>
        )}
        {sidebarOpen && error && (
          <div className="mono text-[10px] text-red-400">{error}</div>
        )}

        {sidebarOpen && !loading && (
          <>
            {/* _master-index first */}
            <button
              onClick={() => loadPage('_master-index')}
              className={[
                'w-full text-left mono text-[10px] px-2 py-1 rounded mb-1 truncate',
                selectedSlug === '_master-index'
                  ? 'text-[#E5E5E7] bg-[#1F1F23]'
                  : 'text-text-secondary hover:text-text-primary hover:bg-[#1F1F23]/50',
              ].join(' ')}
            >
              Index
            </button>

            {Object.keys(grouped)
              .sort((a, b) => (a === '_root' ? -1 : b === '_root' ? 1 : a.localeCompare(b)))
              .map((section) => (
                <div key={section} className="mb-3">
                  <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.3)] px-2 mb-1">
                    {section === '_root' ? 'Root' : section}
                  </div>
                  {grouped[section]
                    .filter((p) => p.slug !== '_master-index')
                    .map((page) => (
                      <button
                        key={page.slug}
                        onClick={() => loadPage(page.slug)}
                        className={[
                          'w-full text-left mono text-[10px] px-2 py-1 rounded mb-0.5 truncate',
                          selectedSlug === page.slug
                            ? 'text-[#E5E5E7] bg-[#1F1F23]'
                            : 'text-text-secondary hover:text-text-primary hover:bg-[#1F1F23]/50',
                        ].join(' ')}
                        title={page.slug}
                      >
                        {page.title}
                      </button>
                    ))}
                </div>
              ))}
          </>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex gap-4">
        <div className="flex-1 min-w-0">
          {/* Page header */}
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <div className="mono text-[11px] text-text-secondary truncate">{selectedSlug}</div>
              {pageContent?.mtime && (
                <div className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
                  Modified {pageContent.mtime.slice(0, 10)}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {editability === 'open' && !editing && (
                <button
                  onClick={() => {
                    setEditDraft(pageContent?.content ?? '');
                    setEditing(true);
                    setSaveMsg(null);
                  }}
                  className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded border border-[#1F1F23] text-text-secondary hover:text-text-primary hover:border-[rgba(229,229,231,0.2)] transition-colors"
                >
                  Edit
                </button>
              )}
              {editability === 'pr' && !editing && (
                <button
                  onClick={() => {
                    setEditDraft(pageContent?.content ?? '');
                    setEditing(true);
                    setSaveMsg(null);
                  }}
                  className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded border border-[#1F1F23] text-text-secondary hover:text-text-primary hover:border-[rgba(229,229,231,0.2)] transition-colors"
                >
                  Propose edit
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
                    className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded border border-[#1F1F23] text-text-secondary hover:text-text-primary transition-colors"
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
              className="w-full min-h-[500px] bg-[#0D0D0F] border border-[#1F1F23] rounded p-4 mono text-[11px] text-[#E5E5E7] resize-y focus:outline-none focus:border-[rgba(229,229,231,0.2)]"
              spellCheck={false}
            />
          ) : contentLoading ? (
            <div className="mono text-[11px] text-text-secondary animate-pulse">Loading…</div>
          ) : pageContent ? (
            // eslint-disable-next-line react/no-danger
            <div
              className="wiki-content"
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{
                __html: convertWikilinks(renderMarkdown(pageContent.content)),
              }}
            />
          ) : null}
        </div>

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

      {/* Inline styles for markdown rendering */}
      <style>{`
        .wiki-content wikilink {
          color: #E8763A;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .wiki-content wikilink:hover { opacity: 0.8; }
        .wiki-content .md-h1 { font-size: 1.25rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #E5E5E7; font-family: 'JetBrains Mono', monospace; }
        .wiki-content .md-h2 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.4rem; color: #E5E5E7; font-family: 'JetBrains Mono', monospace; border-bottom: 1px solid #1F1F23; padding-bottom: 0.25rem; }
        .wiki-content .md-h3 { font-size: 0.875rem; font-weight: 600; margin: 0.75rem 0 0.3rem; color: rgba(229,229,231,0.8); font-family: 'JetBrains Mono', monospace; }
        .wiki-content .md-h4, .wiki-content .md-h5, .wiki-content .md-h6 { font-size: 0.8rem; font-weight: 600; margin: 0.5rem 0 0.2rem; color: rgba(229,229,231,0.7); font-family: 'JetBrains Mono', monospace; }
        .wiki-content .md-p { font-size: 0.75rem; color: rgba(229,229,231,0.75); margin: 0.3rem 0; line-height: 1.7; font-family: 'JetBrains Mono', monospace; }
        .wiki-content .md-ul { list-style: disc; padding-left: 1.25rem; margin: 0.4rem 0; }
        .wiki-content .md-ul li { font-size: 0.75rem; color: rgba(229,229,231,0.75); margin: 0.15rem 0; font-family: 'JetBrains Mono', monospace; }
        .wiki-content .code-block { background: #0D0D0F; border: 1px solid #1F1F23; border-radius: 4px; padding: 0.75rem; margin: 0.5rem 0; overflow-x: auto; }
        .wiki-content .code-block code { font-size: 0.7rem; color: rgba(229,229,231,0.8); font-family: 'JetBrains Mono', monospace; white-space: pre; }
        .wiki-content .inline-code { background: #1F1F23; border-radius: 3px; padding: 0 0.25rem; font-size: 0.7rem; color: #E8763A; font-family: 'JetBrains Mono', monospace; }
        .wiki-content .md-link { color: rgba(229,229,231,0.6); text-decoration: underline; text-underline-offset: 2px; font-size: 0.75rem; }
        .wiki-content .md-link:hover { color: #E5E5E7; }
        .wiki-content .hr-rule { border: none; border-top: 1px solid #1F1F23; margin: 0.75rem 0; }
        .wiki-content .check.done { color: #4ade80; }
        .wiki-content .check.todo { color: rgba(229,229,231,0.3); }
        .wiki-content .md-table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.7rem; font-family: 'JetBrains Mono', monospace; }
        .wiki-content .md-table th { border: 1px solid #1F1F23; padding: 0.3rem 0.5rem; color: rgba(229,229,231,0.5); text-align: left; font-weight: 600; background: #0D0D0F; }
        .wiki-content .md-table td { border: 1px solid #1F1F23; padding: 0.3rem 0.5rem; color: rgba(229,229,231,0.75); }
      `}</style>
    </div>
  );
}
