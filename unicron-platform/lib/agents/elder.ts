// lib/agents/elder.ts — Sprint 3 Stream B
// Elder agent: continuity advisory. Checks any decision against prior commitments.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export interface ElderAdvisory {
  flag: 'compatible' | 'conflict' | 'requires_explicit_override';
  relevant_commitments: string[];
  notes: string;
}

// ---------------------------------------------------------------------------
// Simple in-memory cache for vault files (5-minute TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  content: string;
  fetchedAt: number;
}

const vaultCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchVaultFile(token: string, repo: string, path: string): Promise<string> {
  const cacheKey = `${repo}/${path}`;
  const cached = vaultCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' },
  });
  if (res.status === 404) {
    vaultCache.set(cacheKey, { content: '', fetchedAt: Date.now() });
    return '';
  }
  if (!res.ok) {
    console.warn(`[elder] fetchVaultFile: unexpected status ${res.status} for ${path}`);
    return '';
  }
  const content = await res.text();
  vaultCache.set(cacheKey, { content, fetchedAt: Date.now() });
  return content;
}

// ---------------------------------------------------------------------------
// elderAdvise
// ---------------------------------------------------------------------------

/**
 * Main Elder advisory function. Call before any irreversible action.
 * Reads continuity.md + seven-generations.md from vault, classifies the decision.
 */
export async function elderAdvise(
  decisionType: string,
  scope: string,
  summary: string
): Promise<ElderAdvisory> {
  const token = process.env.GITHUB_VAULT_TOKEN!;
  const repo = 'freakngenius/unicron-knowledge';

  const [continuityContent, sevenGenContent] = await Promise.all([
    fetchVaultFile(token, repo, 'wiki/memory/elder/continuity.md'),
    fetchVaultFile(token, repo, 'wiki/memory/elder/seven-generations.md'),
  ]);

  const systemPrompt = `You are the Elder for Unicron Systems. Given a proposed decision and the continuity log + seven-generations file, classify the decision as:
- "compatible": no conflicts with prior commitments
- "conflict": directly contradicts a named commitment or promise
- "requires_explicit_override": touches the spirit of a commitment; needs explicit human acknowledgment

Return JSON only: {"flag": "compatible"|"conflict"|"requires_explicit_override", "relevant_commitments": ["..."], "notes": "..."}

Continuity log:
${continuityContent || '(empty — no entries yet)'}

Seven generations:
${sevenGenContent || '(empty — not yet initialized)'}`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Decision type: ${decisionType}\nScope: ${scope}\nSummary: ${summary}`,
      },
    ],
  });

  try {
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const match = raw.match(/\{.*\}/s);
    if (match) {
      return JSON.parse(match[0]) as ElderAdvisory;
    }
    return { flag: 'compatible', relevant_commitments: [], notes: 'Parse error — defaulting to compatible' };
  } catch {
    return { flag: 'compatible', relevant_commitments: [], notes: 'Parse error — defaulting to compatible' };
  }
}

// ---------------------------------------------------------------------------
// appendContinuityEntry
// ---------------------------------------------------------------------------

export interface ContinuityEntry {
  title: string;
  type: 'customer_promise' | 'architectural_decision' | 'public_statement' | 'partnership' | 'regulatory';
  made_by: string;
  made_to: string;
  substance: string;
  evidence: string;
  active_until: string;
  supersedes?: string;
}

/**
 * Append an entry to the Elder continuity log.
 * Called when a requires_explicit_override is acknowledged by a human.
 */
export async function appendContinuityEntry(entry: ContinuityEntry): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const text = `## ${today} — ${entry.title}
- **Type:** ${entry.type}
- **Made_by:** ${entry.made_by}
- **Made_to:** ${entry.made_to}
- **Substance:** ${entry.substance}
- **Evidence:** ${entry.evidence}
- **Active_until:** ${entry.active_until}
- **Supersedes:** ${entry.supersedes ?? 'none'}
`;

  const token = process.env.GITHUB_VAULT_TOKEN!;
  const repo = 'freakngenius/unicron-knowledge';
  const path = 'wiki/memory/elder/continuity.md';

  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let currentContent = '';
  let fileSha: string | undefined;

  if (getRes.ok) {
    const file = (await getRes.json()) as { content: string; sha: string };
    currentContent = Buffer.from(file.content, 'base64').toString('utf-8');
    fileSha = file.sha;
  }

  const newContent = currentContent ? `${currentContent}\n${text}` : text;

  const body: Record<string, unknown> = {
    message: `memory(elder): append continuity entry — ${entry.title}`,
    content: Buffer.from(newContent).toString('base64'),
    committer: { name: 'Unicron Elder', email: 'agent@unicron.systems' },
  };
  if (fileSha) body.sha = fileSha;

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const detail = await putRes.text();
    console.error(`[elder] appendContinuityEntry failed: ${putRes.status} — ${detail}`);
  } else {
    // Invalidate cache so next read fetches fresh content
    const cacheKey = `${repo}/${path}`;
    vaultCache.delete(cacheKey);
  }
}
