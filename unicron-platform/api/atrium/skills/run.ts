// api/atrium/skills/run.ts — Sprint 6 Stream E (extends Sprint 5 Stream G)
// POST /api/atrium/skills/run — execute a skill server-side.
//
// Auth: x-unicron-api-key header (shared internal key from UNICRON_INTERNAL_API_KEY).
// Body: { skill_slug: string; [params]: unknown }
//
// All nervous_system access goes through public-schema RPCs (SECURITY DEFINER).
// PGRST106 fix: no .schema('nervous_system') anywhere in this file.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunBody {
  skill_slug: string;
  // Productivity (Sprint 4)
  team_member_id?: string;
  limit?: number;
  // Research (Sprint 5)
  topic?: string;
  depth?: string;
  question?: string;
  criteria?: string;
  // Sales (Sprint 5)
  customer_id?: string;
  new_stage?: string;
  note?: string;
  // Marketing (Sprint 6)
  target_audience?: string;
  platform?: string;
  audience?: string;
  product?: string;
  page_slug?: string;
  proposed_changes?: string;
  // Passthrough for proxied skills
  params?: Record<string, unknown>;
}

interface LedgerRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  strength: number | null;
  created_at: string;
  status: string | null;
}

interface ActionItemRow {
  id: string;
  title: string;
  priority: string;
  status: string;
  break_off_signal_id: string | null;
  total_count: number;
}

// ─── Scaffolded slugs (202 response) ─────────────────────────────────────────

const SCAFFOLDED_SLUGS = new Set([
  'light-rag-query',
  'morning-trend-scan',
  'competitor-watch',
  'schedule-discovery-call',
  'extract-vertical-signals',
  'draft-follow-up-email',
  'generate-proposal',
]);

// ─── Pipeline stage allowlist ─────────────────────────────────────────────────

const VALID_PIPELINE_STAGES = new Set([
  'lead',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
]);

// ─── Source type scoring weights ──────────────────────────────────────────────

const SOURCE_TYPE_WEIGHT: Record<string, number> = {
  call: 1.0,
  voice_memo: 0.9,
  slack: 0.8,
  email: 0.7,
  cowork_session: 0.6,
  apple_note: 0.5,
  manual: 0.4,
};

function getSourceWeight(sourceType: string): number {
  return SOURCE_TYPE_WEIGHT[sourceType] ?? 0.3;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

function checkAuth(req: VercelRequest): boolean {
  const internalKey = process.env.UNICRON_INTERNAL_API_KEY;
  if (!internalKey) return process.env.VERCEL_ENV !== 'production';
  const provided = req.headers['x-unicron-api-key'];
  return provided === internalKey;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function auditSkillRun(
  skillSlug: string,
  outcome: 'success' | 'scaffolded' | 'error' | 'dispatched',
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = makeSupabase();
    await sb.rpc('ns_append_ledger_signal', {
      p_source_type: 'audit',
      p_source_id: `skill_run/${skillSlug}`,
      p_summary: `skill_run:${skillSlug}:${outcome}`,
      p_insights: meta ?? {},
    });
  } catch {
    // Non-fatal
  }
}

// ─── Sprint 4 Skills ──────────────────────────────────────────────────────────

async function runMorningBrief(
  teamMemberId?: string,
): Promise<{ message: string; delivered_via_slack: boolean }> {
  const sb = makeSupabase();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  // 1. Yesterday's ledger digest (top 3 by strength)
  const { data: ledgerRows } = await sb.rpc('ns_morning_brief_ledger', {
    p_since: yesterdayStart.toISOString(),
    p_until: todayStart.toISOString(),
  });

  const digestLines =
    (ledgerRows ?? []).length > 0
      ? (ledgerRows as LedgerRow[])
          .map((r) => `• [${r.source_type}] ${r.content_summary ?? '(no summary)'}`)
          .join('\n')
      : 'No ingest activity recorded yesterday.';

  // 2. Open escalations
  const { data: escalations } = await sb.rpc('ns_morning_brief_action_items', { p_limit: 3 });
  const rows = (escalations ?? []) as ActionItemRow[];
  const totalEscalations = rows[0]?.total_count ?? 0;

  const PRIORITY_ORDER: Record<string, number> = {
    irreversible: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const sortedEscalations = [...rows].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4),
  );

  const escalationLines =
    sortedEscalations.length > 0
      ? sortedEscalations.map((e) => `• [${e.priority.toUpperCase()}] ${e.title}`).join('\n')
      : 'None';

  // 3. Format time in PT
  const ptTime = now.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
  });
  const weekday = now.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
  });
  const date = now.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const message = [
    `*Morning Brief — ${weekday}, ${date}*`,
    '',
    "*Yesterday's Digest*",
    digestLines,
    '',
    `*Escalations* — ${totalEscalations} open`,
    escalationLines,
    '',
    '*Sprint Status*',
    'Check the Atrium Work tab for active sprint details.',
    '',
    `_Brief generated at ${ptTime} PT_`,
  ].join('\n');

  // 4. Post to Slack if token is configured
  let deliveredViaSlack = false;
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (slackToken && teamMemberId) {
    try {
      const { data: memberRows } = await sb.rpc('ns_get_team_member_slack_id', {
        p_member_id: teamMemberId,
      });
      const slackUserId = (memberRows as Array<{ slack_user_id: string | null }>)?.[0]?.slack_user_id;
      if (slackUserId) {
        const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${slackToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel: slackUserId, text: message }),
        });
        const slackJson = (await slackRes.json()) as { ok: boolean };
        deliveredViaSlack = slackJson.ok === true;
      }
    } catch {
      // Non-fatal
    }
  }

  return { message, delivered_via_slack: deliveredViaSlack };
}

async function runInboxTriage(
  limitParam?: number,
): Promise<{ items: (LedgerRow & { score: number })[]; message?: string }> {
  const sb = makeSupabase();
  const limit = Math.min(Math.max(1, limitParam ?? 5), 20);

  const { data: rows } = await sb.rpc('ns_list_inbox_ledger', { p_limit: 50 });

  if (!rows || (rows as LedgerRow[]).length === 0) {
    return { items: [], message: 'Inbox is empty' };
  }

  const now = Date.now();

  const scored = (rows as LedgerRow[]).map((row) => {
    const hoursSince = (now - new Date(row.created_at).getTime()) / 3_600_000;
    const recencyScore = 1 / (1 + hoursSince);
    const strength = row.strength ?? 0.5;
    const sourceWeight = getSourceWeight(row.source_type);
    const score = 0.4 * recencyScore + 0.4 * strength + 0.2 * sourceWeight;
    return { ...row, score: Math.round(score * 10000) / 10000 };
  });

  scored.sort((a, b) => b.score - a.score);

  return { items: scored.slice(0, limit) };
}

// ─── Sprint 5 Skills ──────────────────────────────────────────────────────────

async function runDeepResearch(topic: string, depth?: string): Promise<unknown> {
  const pathfinderBase = process.env.VITE_PATHFINDER_INTERNAL_URL ?? '';
  if (!pathfinderBase) {
    throw new Error(
      'VITE_PATHFINDER_INTERNAL_URL is not configured — cannot proxy to deep-research endpoint.',
    );
  }

  const url = `${pathfinderBase.replace(/\/$/, '')}/api/skills/deep-research`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, depth: depth ?? 'standard' }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`deep-research upstream error ${res.status}: ${text}`);
  }

  return res.json();
}

async function runLlmCouncilDeliberate(question: string, criteria?: string): Promise<unknown> {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:5173';

  const url = `${baseUrl}/api/atrium/council-deliberate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-unicron-api-key': process.env.UNICRON_INTERNAL_API_KEY ?? '',
    },
    body: JSON.stringify({ question, criteria }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`council-deliberate upstream error ${res.status}: ${text}`);
  }

  return res.json();
}

async function runTrackPipelineStage(
  customerId: string,
  newStage: string,
  note?: string,
): Promise<{ updated: boolean; customer_id: string; stage: string }> {
  if (!VALID_PIPELINE_STAGES.has(newStage)) {
    throw new Error(
      `Invalid pipeline stage '${newStage}'. Valid stages: ${[...VALID_PIPELINE_STAGES].join(', ')}`,
    );
  }

  const sb = makeSupabase();

  const { error } = await sb.rpc('ns_update_customer_stage', {
    p_id: customerId,
    p_stage: newStage,
  });

  if (error) throw new Error(`Failed to update customer stage: ${errMsg(error)}`);

  await sb.rpc('ns_append_ledger_signal', {
    p_source_type: 'manual',
    p_source_id: `customers/${customerId}`,
    p_summary: `Pipeline stage updated: customer ${customerId} → ${newStage}${note ? ` · ${note}` : ''}`,
    p_insights: { customer_id: customerId, new_stage: newStage, note: note ?? null },
  });

  return { updated: true, customer_id: customerId, stage: newStage };
}

// ─── Sprint 6 Marketing Skills ───────────────────────────────────────────────

const BRAND_VOICE_CONTEXT = `
Unicron Systems is a 2-person startup building a self-designing agentic intelligence platform.
Brand voice: direct, technical, no fluff. We build for operators and sales teams who need
intelligence without noise. Customer-zero is Zedcor (construction surveillance, mobile solar towers).
Products: Pathfinder (customer-facing lead intelligence), Metacron (operator platform),
Atrium (internal cockpit). We are formally fundraising.
`.trim();

async function callClaudeOrMock(prompt: string, mockResponse: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return mockResponse;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
  const firstText = data.content.find((b) => b.type === 'text');
  return firstText?.text ?? mockResponse;
}

async function runDraftBlogPost(
  topic: string,
  targetAudience?: string,
): Promise<{ draft: string; word_count: number }> {
  const audience = targetAudience ?? 'construction security and surveillance buyers';
  const prompt = [
    `You are a content writer for Unicron Systems with this brand context:\n${BRAND_VOICE_CONTEXT}`,
    '',
    `Write a blog post draft on the following topic:`,
    `Topic: ${topic}`,
    `Target audience: ${audience}`,
    '',
    'Requirements:',
    '- 400–600 words',
    '- Direct, technical tone — no filler phrases',
    '- Include: hook opening paragraph, 2-3 body sections with subheadings, concrete closing CTA',
    '- Write in Markdown',
  ].join('\n');

  const mock = [
    `# ${topic}`,
    '',
    'The construction surveillance industry is changing faster than most operators realize. Here is what that means for your team.',
    '',
    '## The Problem',
    `${topic} is not an abstract concern — it is a daily operational gap that costs buyers time and missed opportunities.`,
    '',
    '## What Changes When You Fix It',
    'Operators who close this gap report faster qualification cycles and fewer cold calls that go nowhere.',
    '',
    '## The Path Forward',
    'Unicron Systems builds intelligence that works the way operators actually think — contextual, scored, and ready to act on.',
    '',
    '**Ready to see it in action?** Book a demo at unicron.systems.',
  ].join('\n');

  const draft = await callClaudeOrMock(prompt, mock);
  const wordCount = draft.split(/\s+/).filter(Boolean).length;

  try {
    const sb = makeSupabase();
    await sb.rpc('ns_append_ledger_signal', {
      p_source_type: 'agent_run',
      p_source_id: 'skill/draft-blog-post',
      p_summary: `Blog post drafted: "${topic}"`,
      p_insights: { topic, audience },
    });
  } catch { /* non-fatal */ }

  return { draft, word_count: wordCount };
}

async function runDraftSocialPost(
  topic: string,
  platform?: string,
): Promise<{ linkedin?: string; twitter?: string }> {
  const target = (platform ?? 'both').toLowerCase();
  const validPlatforms = new Set(['linkedin', 'twitter', 'both']);
  const resolvedTarget = validPlatforms.has(target) ? target : 'both';

  const sections: string[] = [];
  if (resolvedTarget === 'linkedin' || resolvedTarget === 'both') {
    sections.push('LinkedIn post (150–200 words, professional tone, 2-3 hashtags):');
  }
  if (resolvedTarget === 'twitter' || resolvedTarget === 'both') {
    sections.push('Twitter/X post (under 280 characters, punchy, 1-2 hashtags):');
  }

  const prompt = [
    `You are a social media writer for Unicron Systems with this brand context:\n${BRAND_VOICE_CONTEXT}`,
    '',
    `Topic/milestone: ${topic}`,
    '',
    `Write the following social post(s). Return each clearly labeled:`,
    ...sections,
    '',
    'Tone: direct, no buzzwords, operator-credible. Lead with a concrete insight or result.',
  ].join('\n');

  const mockLinkedIn = `We shipped something this week that changes how surveillance operators find their next customer.\n\nPathfinder now surfaces procurement signals before the RFP drops — scored, verified, and ready to act on. No cold lists. No noise.\n\nFor teams like Zedcor, that is the difference between first call and missed bid.\n\nMore at unicron.systems.\n\n#ConstructionTech #SalesTech #AgentAI`;
  const mockTwitter = `Procurement signals before the RFP. Lead scores before the cold call. That is what Pathfinder does for surveillance operators. #ConstructionTech`;

  let result: { linkedin?: string; twitter?: string } = {};

  if (resolvedTarget === 'both') {
    const raw = await callClaudeOrMock(prompt, `LinkedIn:\n${mockLinkedIn}\n\nTwitter:\n${mockTwitter}`);
    const liMatch = raw.match(/linkedin[:\s]+([\s\S]+?)(?=twitter[:\s]+|$)/i);
    const twMatch = raw.match(/twitter[:\s]+([\s\S]+?)$/i);
    result = {
      linkedin: liMatch ? liMatch[1].trim() : raw,
      twitter: twMatch ? twMatch[1].trim() : undefined,
    };
  } else if (resolvedTarget === 'linkedin') {
    result.linkedin = await callClaudeOrMock(prompt, mockLinkedIn);
  } else {
    result.twitter = await callClaudeOrMock(prompt, mockTwitter);
  }

  try {
    const sb = makeSupabase();
    await sb.rpc('ns_append_ledger_signal', {
      p_source_type: 'agent_run',
      p_source_id: 'skill/draft-social-post',
      p_summary: `Social post drafted: "${topic}" (${resolvedTarget})`,
      p_insights: { topic, platform: resolvedTarget },
    });
  } catch { /* non-fatal */ }

  return result;
}

interface DeckSlide {
  title: string;
  bullet_points: string[];
}

async function runGeneratePositioningDeck(
  audience: string,
  product?: string,
): Promise<{ slides: DeckSlide[]; product: string; audience: string }> {
  const resolvedProduct =
    (product ?? 'pathfinder').toLowerCase() === 'metacron' ? 'Metacron' : 'Pathfinder';

  const prompt = [
    `You are a positioning strategist for Unicron Systems with this brand context:\n${BRAND_VOICE_CONTEXT}`,
    '',
    `Generate a slide-by-slide positioning deck outline for ${resolvedProduct} targeting: ${audience}`,
    '',
    'Return a JSON array of slide objects with this exact shape:',
    '[{"title": "Slide Title", "bullet_points": ["point 1", "point 2", "point 3"]}]',
    '',
    'Include 6-8 slides covering: opening hook, problem, solution, proof, differentiation, business case, CTA.',
    'Return ONLY the JSON array, no markdown wrapper.',
  ].join('\n');

  const mockSlides: DeckSlide[] = [
    {
      title: 'The Intelligence Gap in Construction Surveillance',
      bullet_points: [
        'Operators miss 60% of procurement signals because they arrive too late',
        'RFPs go to whoever got the tip — not the best-fit vendor',
        `${resolvedProduct} changes the timing equation`,
      ],
    },
    {
      title: 'What Buyers Actually Need',
      bullet_points: [
        `${audience} need lead intelligence that arrives before the RFP`,
        'Scored, verified, and contextualized — not a raw list',
        'Integrated into the way reps already work',
      ],
    },
    {
      title: `How ${resolvedProduct} Works`,
      bullet_points: [
        'Ingests procurement signals from public + private sources daily',
        'AI scores and verifies each lead against your customer profile',
        'Delivers a prioritized, actionable list every morning',
      ],
    },
    {
      title: 'Proof: Zedcor Pilot Results',
      bullet_points: [
        '24 branches onboarded in week one',
        'First qualified inbound from signal-to-call in 48 hours',
        'Zero cold list spend during pilot period',
      ],
    },
    {
      title: 'Why Not Build It In-House',
      bullet_points: [
        'Data sourcing, scoring models, and enrichment take 6+ months to build right',
        `${resolvedProduct} is live, tuned, and improving weekly`,
        'Your team focuses on selling — we handle the intelligence layer',
      ],
    },
    {
      title: 'Business Case',
      bullet_points: [
        'One closed deal from a surfaced lead covers a full year of cost',
        'Reps contact qualified prospects instead of cold lists',
        'ROI measurable within the first billing cycle',
      ],
    },
    {
      title: 'Next Step',
      bullet_points: [
        'Pilot with your top 3 reps for 30 days',
        'No integration required — works alongside your current CRM',
        'Book a demo: unicron.systems',
      ],
    },
  ];

  let slides: DeckSlide[] = mockSlides;

  const raw = await callClaudeOrMock(prompt, JSON.stringify(mockSlides));
  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as DeckSlide[];
    if (Array.isArray(parsed) && parsed.length > 0) slides = parsed;
  } catch { /* keep mockSlides */ }

  try {
    const sb = makeSupabase();
    await sb.rpc('ns_append_ledger_signal', {
      p_source_type: 'agent_run',
      p_source_id: 'skill/generate-positioning-deck',
      p_summary: `Positioning deck generated: ${resolvedProduct} for "${audience}"`,
      p_insights: { product: resolvedProduct, audience },
    });
  } catch { /* non-fatal */ }

  return { slides, product: resolvedProduct, audience };
}

async function runUpdateManifestoPage(
  pageSlug: string,
  proposedChanges: string,
): Promise<{ proposed_edit: string; page_slug: string }> {
  const prompt = [
    `You are an editor for Unicron Systems with this brand context:\n${BRAND_VOICE_CONTEXT}`,
    '',
    `You are proposing edits to the manifesto page: "${pageSlug}"`,
    '',
    `Proposed changes requested by the operator:`,
    proposedChanges,
    '',
    'Write the proposed edits as a clear editorial proposal in Markdown.',
    'Include: a one-sentence rationale, the specific text to add or change (quoted), and the suggested placement.',
    'Be concise — this is a proposal for human review, not the final copy.',
  ].join('\n');

  const mock = [
    `## Proposed Edit: ${pageSlug}`,
    '',
    '**Rationale:** Recent company developments strengthen the core argument and should be reflected in the manifesto.',
    '',
    '**Proposed addition** (insert after second paragraph):',
    '> ' + proposedChanges.split('\n')[0],
    '',
    '**Context:** This update aligns the manifesto with the current product reality and fundraising posture.',
    '',
    '_This is a proposal for human review — no changes are live until approved._',
  ].join('\n');

  const proposed_edit = await callClaudeOrMock(prompt, mock);

  try {
    const sb = makeSupabase();
    await sb.rpc('ns_append_ledger_signal', {
      p_source_type: 'agent_run',
      p_source_id: 'skill/update-manifesto-page',
      p_summary: `Manifesto page edit proposed: "${pageSlug}"`,
      p_insights: { page_slug: pageSlug },
    });
  } catch { /* non-fatal */ }

  return { proposed_edit, page_slug: pageSlug };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-unicron-api-key');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  if (!checkAuth(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(500).json({ ok: false, error: 'Supabase env vars not configured' });
    return;
  }

  const body = req.body as RunBody | undefined;
  const { skill_slug, team_member_id, limit } = body ?? {};

  if (!skill_slug || typeof skill_slug !== 'string') {
    res.status(400).json({ ok: false, error: 'skill_slug is required' });
    return;
  }

  // ─── Scaffolded skills: 202 + message ─────────────────────────────────────

  if (SCAFFOLDED_SLUGS.has(skill_slug)) {
    void auditSkillRun(skill_slug, 'scaffolded');
    res.status(202).json({
      ok: true,
      status: 'scaffolded',
      skill_slug,
      message: 'Full implementation coming in a future sprint',
    });
    return;
  }

  // ─── Implemented skills ───────────────────────────────────────────────────

  try {
    switch (skill_slug) {

      case 'morning-brief': {
        const result = await runMorningBrief(team_member_id);
        void auditSkillRun(skill_slug, 'success');
        res.status(200).json({ ok: true, skill_slug, ...result });
        return;
      }

      case 'inbox-triage': {
        const limitParam = typeof limit === 'number' ? limit : undefined;
        const result = await runInboxTriage(limitParam);
        void auditSkillRun(skill_slug, 'success');
        res.status(200).json({ ok: true, skill_slug, ...result });
        return;
      }

      case 'quick-capture': {
        res.status(400).json({
          ok: false,
          error:
            'quick-capture is a UI trigger skill — it opens the QuickCapture modal client-side and does not call this endpoint.',
        });
        return;
      }

      case 'deep-research': {
        const topic = body?.topic ?? (body?.params?.topic as string | undefined);
        if (!topic || typeof topic !== 'string') {
          res.status(400).json({ ok: false, error: 'topic is required for deep-research' });
          return;
        }
        const depth = body?.depth ?? (body?.params?.depth as string | undefined);
        const result = await runDeepResearch(topic, depth);
        void auditSkillRun(skill_slug, 'success', { topic });
        res.status(200).json({ ok: true, skill_slug, ...Object(result) });
        return;
      }

      case 'llm-council-deliberate': {
        const question = body?.question ?? (body?.params?.question as string | undefined);
        if (!question || typeof question !== 'string') {
          res.status(400).json({ ok: false, error: 'question is required for llm-council-deliberate' });
          return;
        }
        const criteria = body?.criteria ?? (body?.params?.criteria as string | undefined);
        const result = await runLlmCouncilDeliberate(question, criteria);
        void auditSkillRun(skill_slug, 'success');
        res.status(200).json({ ok: true, skill_slug, ...Object(result) });
        return;
      }

      case 'track-pipeline-stage': {
        const customerId = body?.customer_id ?? (body?.params?.customer_id as string | undefined);
        const newStage = body?.new_stage ?? (body?.params?.new_stage as string | undefined);
        if (!customerId || typeof customerId !== 'string') {
          res.status(400).json({ ok: false, error: 'customer_id is required for track-pipeline-stage' });
          return;
        }
        if (!newStage || typeof newStage !== 'string') {
          res.status(400).json({ ok: false, error: 'new_stage is required for track-pipeline-stage' });
          return;
        }
        const note = body?.note ?? (body?.params?.note as string | undefined);
        const result = await runTrackPipelineStage(customerId, newStage, note);
        void auditSkillRun(skill_slug, 'success', { customer_id: customerId, new_stage: newStage });
        res.status(200).json({ ok: true, skill_slug, ...result });
        return;
      }

      case 'draft-blog-post': {
        const topic = body?.topic ?? (body?.params?.topic as string | undefined);
        if (!topic || typeof topic !== 'string') {
          res.status(400).json({ ok: false, error: 'topic is required for draft-blog-post' });
          return;
        }
        const targetAudience = body?.target_audience ?? (body?.params?.target_audience as string | undefined);
        const result = await runDraftBlogPost(topic, targetAudience);
        void auditSkillRun(skill_slug, 'success', { topic });
        res.status(200).json({ ok: true, skill_slug, ...result });
        return;
      }

      case 'draft-social-post': {
        const topic = body?.topic ?? (body?.params?.topic as string | undefined);
        if (!topic || typeof topic !== 'string') {
          res.status(400).json({ ok: false, error: 'topic is required for draft-social-post' });
          return;
        }
        const platform = body?.platform ?? (body?.params?.platform as string | undefined);
        const result = await runDraftSocialPost(topic, platform);
        void auditSkillRun(skill_slug, 'success', { topic, platform });
        res.status(200).json({ ok: true, skill_slug, ...result });
        return;
      }

      case 'generate-positioning-deck': {
        const audience = body?.audience ?? (body?.params?.audience as string | undefined);
        if (!audience || typeof audience !== 'string') {
          res.status(400).json({ ok: false, error: 'audience is required for generate-positioning-deck' });
          return;
        }
        const product = body?.product ?? (body?.params?.product as string | undefined);
        const result = await runGeneratePositioningDeck(audience, product);
        void auditSkillRun(skill_slug, 'success', { audience, product });
        res.status(200).json({ ok: true, skill_slug, ...result });
        return;
      }

      case 'slack-daily-scan': {
        // Dispatches the same Inngest event the 06:00 PT cron fires. The
        // function (slackDailyScanRun in lib/agents/inngest-fns.ts) handles
        // the actual scan + writes; we don't await execution here — Inngest
        // executes async and the result lands in nervous_system.slack_daily_digest
        // for the Atrium UI to pick up via ns_slack_daily_digest_for_date.
        const date =
          body?.params && typeof body.params.date === 'string'
            ? (body.params.date as string)
            : undefined;
        const dryRun =
          body?.params && typeof body.params.dryRun === 'boolean'
            ? (body.params.dryRun as boolean)
            : false;

        const inngestBaseUrl = process.env.INNGEST_API_BASE_URL?.trim();
        const inngestEventKey = process.env.INNGEST_EVENT_KEY?.trim();
        if (!inngestBaseUrl || !inngestEventKey) {
          res.status(503).json({
            ok: false,
            error:
              'INNGEST_API_BASE_URL or INNGEST_EVENT_KEY not set on this Vercel env — cannot dispatch slack-daily-scan',
          });
          return;
        }

        const dispatchUrl = `${inngestBaseUrl}/e/${inngestEventKey}`;
        const dispatchRes = await fetch(dispatchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'slack/daily-scan.run',
            data: { date, dryRun },
          }),
        });

        if (!dispatchRes.ok) {
          const errText = await dispatchRes.text();
          void auditSkillRun(skill_slug, 'error', {
            inngest_status: dispatchRes.status,
            inngest_body: errText.slice(0, 500),
          });
          res.status(502).json({
            ok: false,
            error: `Inngest dispatch failed: ${dispatchRes.status}`,
            details: errText.slice(0, 500),
          });
          return;
        }

        const ids = (await dispatchRes.json().catch(() => ({ ids: [] }))) as { ids?: string[] };
        void auditSkillRun(skill_slug, 'dispatched', { date: date ?? null, dryRun });
        res.status(202).json({
          ok: true,
          skill_slug,
          status: 'dispatched',
          message:
            'Slack daily scan dispatched. Result will land in Atrium Now > Digest within a few minutes.',
          inngest_event_ids: ids.ids ?? [],
          date: date ?? null,
          dryRun,
        });
        return;
      }

      case 'update-manifesto-page': {
        const pageSlug = body?.page_slug ?? (body?.params?.page_slug as string | undefined);
        const proposedChanges =
          body?.proposed_changes ?? (body?.params?.proposed_changes as string | undefined);
        if (!pageSlug || typeof pageSlug !== 'string') {
          res.status(400).json({ ok: false, error: 'page_slug is required for update-manifesto-page' });
          return;
        }
        if (!proposedChanges || typeof proposedChanges !== 'string') {
          res.status(400).json({ ok: false, error: 'proposed_changes is required for update-manifesto-page' });
          return;
        }
        const result = await runUpdateManifestoPage(pageSlug, proposedChanges);
        void auditSkillRun(skill_slug, 'success', { page_slug: pageSlug });
        res.status(200).json({ ok: true, skill_slug, ...result });
        return;
      }

      default: {
        res.status(404).json({
          ok: false,
          error: `skill '${skill_slug}' is not implemented as an API skill`,
        });
        return;
      }
    }
  } catch (err) {
    const message = errMsg(err);
    void auditSkillRun(skill_slug, 'error', { error: message });
    res.status(500).json({ ok: false, error: message });
  }
}
