// lib/agents/researcher.ts — Sprint 7.5 reification
//
// Researcher runs deep dives on customer / competitor / topic queries and
// produces a structured brief grounded in real upstream data (ledger rows,
// vault embeddings). Writes the brief to vault + ledger source_type=
// 'research_brief'.
//
// Reads (declared data sources):
//   - nervous_system.ledger          → recent rows matching topic (text search)
//   - nervous_system.vault_embeddings → top-k similar vault docs (optional)
//   - Anthropic (claude-haiku-4-5)    → synthesis (with citations to ledger ids)
// Sink:
//   - nervous_system.ledger row source_type='research_brief'
//   - vault file at wiki/research/<for_date>-<slug>.md
//   - audit_log row action='researcher_brief_complete'

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VAULT_REPO = 'freakngenius/unicron-knowledge';

interface LedgerHit {
  id: string;
  source_type: string;
  source_url: string | null;
  content_summary: string | null;
  content_full: string | null;
  created_at: string;
}

export interface ResearcherBriefResult {
  topic: string;
  forDate: string;
  slug: string;
  vaultPath: string | null;
  vaultStatus: number | null;
  ledger_id: string | null;
  audit_log_id: string | null;
  hits: number;
  hit_excerpts: Array<{ id: string; source_type: string; preview: string }>;
  synthesis: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

async function writeVaultFile(path: string, content: string): Promise<{ status: number }> {
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) return { status: 0 };

  // Existing-file fetch for sha
  let sha: string | undefined;
  try {
    const getRes = await fetch(`https://api.github.com/repos/${VAULT_REPO}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (getRes.ok) {
      const f = (await getRes.json()) as { sha?: string };
      sha = f.sha;
    }
  } catch { /* ignore */ }

  const body: Record<string, unknown> = {
    message: `research: ${path}`,
    content: Buffer.from(content).toString('base64'),
    committer: { name: 'Unicron Researcher', email: 'agent@unicron.systems' },
  };
  if (sha) body.sha = sha;

  try {
    const putRes = await fetch(`https://api.github.com/repos/${VAULT_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: putRes.status };
  } catch (err) {
    console.error('[researcher] vault PUT threw:', err instanceof Error ? err.message : err);
    return { status: 0 };
  }
}

async function synthesize(topic: string, hits: LedgerHit[]): Promise<string> {
  if (hits.length === 0) {
    return `No upstream data found for topic "${topic}". Ledger search returned zero hits across nervous_system.ledger. Consider widening the search terms or scheduling a discovery call.`;
  }
  // Try Anthropic; on any failure, fall back to a deterministic synthesis.
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();
    const ctxBlocks = hits.slice(0, 8).map((h, i) => `[${i + 1}] (ledger ${h.id}, source_type=${h.source_type})\n${(h.content_full ?? h.content_summary ?? '').slice(0, 600)}`).join('\n\n');
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: `You are the Unicron Researcher. Synthesize the user's research topic against the supplied real ledger excerpts. Cite ledger ids inline like [ledger 7f3...]. If the excerpts don't address the topic, say so explicitly — never invent claims. Voice: tight, evidence-first, no fluff.`,
      messages: [
        { role: 'user', content: `Topic: ${topic}\n\nExcerpts from nervous_system.ledger:\n\n${ctxBlocks}\n\nReturn a 3-5 paragraph synthesis with inline ledger-id citations and one open-question list at the end.` },
      ],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    if (text.trim().length > 0) return text;
  } catch (err) {
    console.error('[researcher] anthropic synth failed:', err instanceof Error ? err.message : err);
  }
  // Deterministic fallback
  const bullets = hits.slice(0, 10).map((h) => `- (ledger ${h.id.slice(0, 8)}) [${h.source_type}] ${(h.content_summary ?? '').slice(0, 140)}`).join('\n');
  return `Synthesis (deterministic fallback — Anthropic unavailable):\n\nTopic: ${topic}\n\nMatched ${hits.length} ledger excerpts:\n\n${bullets}\n\nNext step: re-run with Anthropic available for a synthesized narrative.`;
}

export async function researcherBrief(opts: { topic: string; forDate?: string }): Promise<ResearcherBriefResult> {
  const topic = opts.topic.trim();
  if (!topic) throw new Error('topic is required');
  const now = new Date();
  const forDate = opts.forDate ?? now.toISOString().split('T')[0];
  const slug = slugify(topic);

  // Search ledger for relevant rows. Postgres ilike covers content_summary +
  // content_full. We split topic into significant tokens (len > 2) and OR them.
  const tokens = topic.split(/\W+/).filter((t) => t.length > 2);
  const orClauses = tokens.map((t) => `content_summary.ilike.%${t}%,content_full.ilike.%${t}%`).join(',');
  let hits: LedgerHit[] = [];
  if (orClauses.length > 0) {
    const { data, error } = await supabase
      .schema('nervous_system')
      .from('ledger')
      .select('id, source_type, source_url, content_summary, content_full, created_at')
      .or(orClauses)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) console.error('[researcher] ledger search:', error.message);
    hits = (data ?? []) as LedgerHit[];
  }

  // Anthropic synthesis (or deterministic fallback)
  const synthesis = await synthesize(topic, hits);

  // Build markdown
  const lines: string[] = [];
  lines.push(`# Research brief — ${topic}`);
  lines.push('');
  lines.push(`Run timestamp: ${now.toISOString()}`);
  lines.push(`Ledger hits: ${hits.length}`);
  lines.push('');
  lines.push(`## Synthesis`);
  lines.push('');
  lines.push(synthesis);
  lines.push('');
  if (hits.length > 0) {
    lines.push(`## Source ledger excerpts`);
    lines.push('');
    for (const h of hits.slice(0, 15)) {
      lines.push(`- \`${h.id}\` [${h.source_type}] ${(h.content_summary ?? '').slice(0, 160)}`);
    }
  }
  const reportMd = lines.join('\n');

  // Vault write
  const vaultPath = `wiki/research/${forDate}-${slug}.md`;
  const vaultResult = await writeVaultFile(vaultPath, reportMd);

  // Ledger insert
  let ledger_id: string | null = null;
  const ledgerInsert = await supabase
    .schema('nervous_system')
    .from('ledger')
    .insert({
      source_type: 'research_brief',
      source_url: null,
      source_id: `researcher::${slug}::${forDate}`,
      content_summary: `Research brief: ${topic} (${hits.length} ledger excerpts)`,
      content_full: synthesis,
      insights: {
        topic,
        slug,
        hit_count: hits.length,
        hit_ids: hits.slice(0, 15).map((h) => h.id),
        vault_path: vaultPath,
        vault_status: vaultResult.status,
      },
      strength: hits.length > 0 ? 0.6 : 0.2,
      ttl_days: 90,
    })
    .select('id')
    .single();
  if (ledgerInsert.error) {
    console.error('[researcher] ledger insert:', ledgerInsert.error.message);
  } else if (ledgerInsert.data) {
    ledger_id = ledgerInsert.data.id as string;
  }

  // audit_log
  let audit_log_id: string | null = null;
  try {
    const { data: row, error } = await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'nervous_system.agents',
        action: 'researcher_brief_complete',
        payload: {
          topic,
          slug,
          for_date: forDate,
          vault_path: vaultPath,
          vault_status: vaultResult.status,
          hits: hits.length,
          ledger_id,
        },
      })
      .select('id')
      .single();
    if (error) console.error('[researcher] audit_log:', error.message);
    else if (row) audit_log_id = row.id as string;
  } catch (err) {
    console.error('[researcher] audit_log threw:', err instanceof Error ? err.message : err);
  }

  return {
    topic,
    forDate,
    slug,
    vaultPath,
    vaultStatus: vaultResult.status,
    ledger_id,
    audit_log_id,
    hits: hits.length,
    hit_excerpts: hits.slice(0, 5).map((h) => ({
      id: h.id,
      source_type: h.source_type,
      preview: (h.content_summary ?? '').slice(0, 120),
    })),
    synthesis,
  };
}
