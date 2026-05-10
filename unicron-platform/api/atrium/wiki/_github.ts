// GitHub API fallback for wiki routes when VAULT_PATH is unavailable on Vercel.
// Used by wiki/index.ts, wiki/[slug].ts, and vault/search.ts.

const REPO = process.env.GITHUB_VAULT_REPO ?? 'freakngenius/unicron-knowledge';
const TOKEN = process.env.GITHUB_VAULT_TOKEN;

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'unicron-atrium/1.0',
  };
  if (TOKEN) h['Authorization'] = `Bearer ${TOKEN}`;
  return h;
}

interface TreeItem { path: string; type: string; sha: string; }

export interface GhFile { path: string; sha: string; }

/** List all .md files under wiki/ using the git tree API (1 request). */
export async function ghListWikiFiles(): Promise<GhFile[]> {
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`,
    { headers: ghHeaders() },
  );
  if (!r.ok) throw new Error(`GitHub tree API: ${r.status}`);
  const { tree } = (await r.json()) as { tree: TreeItem[] };
  return tree
    .filter((item) => item.type === 'blob' && item.path.startsWith('wiki/') && item.path.endsWith('.md'))
    .map((item) => ({ path: item.path, sha: item.sha }));
}

/** Fetch raw content of a blob by SHA (base64 decoded). */
export async function ghFetchBlob(sha: string): Promise<string> {
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/git/blobs/${sha}`,
    { headers: ghHeaders() },
  );
  if (!r.ok) throw new Error(`GitHub blob API: ${r.status}`);
  const { content } = (await r.json()) as { content: string; encoding: string };
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf-8');
}

/** Fetch a single file's content by its repo-relative path. Returns null if not found. */
export async function ghFetchFile(repoPath: string): Promise<{ content: string; sha: string } | null> {
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${repoPath}`,
    { headers: ghHeaders() },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub contents API: ${r.status}`);
  const data = (await r.json()) as { content: string; sha: string };
  const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
  return { content, sha: data.sha };
}
