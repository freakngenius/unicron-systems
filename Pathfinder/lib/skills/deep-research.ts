// lib/skills/deep-research.ts — Sprint 5 Stream C
//
// deep-research skill: 4-pass autoresearch pattern per SPEC Addendum 2 §2.8.
//
// Pass 1 — Outline generation (claude-sonnet-4-5):
//   Decomposes the topic into 8-12 sections with questions and claims.
// Pass 2 — Section drafting (claude-sonnet-4-5, up to 4 concurrent):
//   Drafts 400-600 word sections with inline [SOURCE: ...] citations.
// Pass 3 — Cross-section synthesis (claude-sonnet-4-5):
//   Produces executive summary + key insights/questions/recommendations.
// Pass 4 — Citation extraction (post-processing, no LLM):
//   Parses [SOURCE: ...] markers to build sources.md.
//
// Output files → Pathfinder/vault/Memory/wiki/research/<slug>/
//   brief.md   — executive summary + all sections
//   sources.md — extracted citations table
//   meta.json  — topic, model, counts, status
//
// Production: writes to unicron-knowledge/Memory/wiki/research/<slug>/
// (via writeVaultDoc in lib/ingest/base.ts using freakngenius/unicron-knowledge GitHub API)

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEEP_RESEARCH_MODEL = 'claude-sonnet-4-5';
const MAX_CONCURRENT_SECTIONS = 4;

// Vault path base (local dev). Production target: unicron-knowledge/Memory/wiki/research/
const VAULT_BASE = path.join(process.cwd(), 'vault', 'Memory', 'wiki', 'research');

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DeepResearchConfig {
  topic: string;
  target_pages?: number; // default 10
  max_pages?: number;    // default 15
  slug?: string;         // auto-derived from topic if not provided
}

export interface DeepResearchResult {
  slug: string;
  brief_path: string;
  sources_path: string;
  meta_path: string;
  section_count: number;
  word_count: number;
  status: 'complete' | 'partial' | 'error';
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface OutlineSection {
  title: string;
  questions: string[];
  claims: string[];
}

interface Outline {
  sections: OutlineSection[];
}

interface SectionDraft {
  title: string;
  body: string;
  index: number;
}

interface Synthesis {
  executive_summary: string;
  key_insights: string[];
  open_questions: string[];
  actionable_recommendations: string[];
}

interface ExtractedSource {
  reference: string;
  section: string;
  claim_context: string;
}

// ─── Test seam ────────────────────────────────────────────────────────────────

let _anthropicOverride: Anthropic | null = null;
export function __setAnthropicForTests(client: Anthropic | null): void {
  _anthropicOverride = client;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClient(): Anthropic {
  if (_anthropicOverride) return _anthropicOverride;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

/**
 * Derive a URL-safe slug from a topic string.
 * e.g. "Public Adjuster Industry Landscape" → "public-adjuster-industry-landscape"
 */
function topicToSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract all [SOURCE: ...] markers from a block of text.
 * Returns de-duplicated references with context.
 */
function extractSources(sectionTitle: string, body: string): ExtractedSource[] {
  const pattern = /\[SOURCE:\s*([^\]]+)\]/g;
  const sources: ExtractedSource[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const reference = match[1].trim();
    // Grab up to 120 chars of surrounding context for the claim
    const start = Math.max(0, match.index - 80);
    const end = Math.min(body.length, match.index + match[0].length + 40);
    const claimContext = body.slice(start, end).replace(/\s+/g, ' ').trim();
    sources.push({ reference, section: sectionTitle, claim_context: claimContext });
  }

  return sources;
}

/**
 * Write content to a local vault file, creating parent directories as needed.
 * Returns the absolute path written.
 */
function writeVaultFile(slug: string, filename: string, content: string): string {
  const dir = path.join(VAULT_BASE, slug);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ─── Pass 1: Outline generation ───────────────────────────────────────────────

async function generateOutline(
  client: Anthropic,
  topic: string,
  targetSections: number
): Promise<Outline> {
  const res = await client.messages.create({
    model: DEEP_RESEARCH_MODEL,
    max_tokens: 2000,
    system: `You are a research architect. Your task is to produce a structured JSON outline for a deep research brief.
Return ONLY valid JSON — no markdown fences, no commentary.
The JSON must exactly match this shape:
{
  "sections": [
    {
      "title": "Section title (concise, sentence case)",
      "questions": ["Question 1?", "Question 2?", "Question 3?"],
      "claims": ["Claim or hypothesis to investigate 1", "Claim 2"]
    }
  ]
}
Produce ${targetSections} sections. Cover the topic comprehensively: context, market/landscape, key players, dynamics, risks, opportunities, and implications.`,
    messages: [
      {
        role: 'user',
        content: `Generate a comprehensive research outline for the topic: "${topic}"

Each section needs a title, 2-4 questions to answer, and 1-3 claims or hypotheses to verify.
Target ${targetSections} sections.`,
      },
    ],
  });

  const raw = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  // Strip markdown fences if the model added them anyway
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonStr) as Outline;
    if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      throw new Error('Outline has no sections');
    }
    return parsed;
  } catch (err) {
    console.error('[deep-research] outline parse error', err, jsonStr.slice(0, 300));
    throw new Error(`Outline generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Pass 2: Section drafting (concurrent) ────────────────────────────────────

async function draftSection(
  client: Anthropic,
  topic: string,
  section: OutlineSection,
  index: number
): Promise<SectionDraft> {
  const questionsBlock = section.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const claimsBlock = section.claims.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const res = await client.messages.create({
    model: DEEP_RESEARCH_MODEL,
    max_tokens: 1200,
    system: `You are a senior research analyst writing a section of a deep research brief.
Write in clear, analytical prose. Target 400-600 words.
For every factual claim or data point, append an inline citation using this exact format: [SOURCE: <url or "common knowledge">]
Do not use markdown headers inside the body — the caller will add the section header.
Do not add preamble or meta-commentary. Start writing the section content directly.`,
    messages: [
      {
        role: 'user',
        content: `Write the research section titled: "${section.title}"
This section is part of a broader report on: "${topic}"

Questions to address:
${questionsBlock}

Claims or hypotheses to investigate:
${claimsBlock}

Write 400-600 words. Include inline [SOURCE: ...] citations for all factual claims.`,
      },
    ],
  });

  const body = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  return { title: section.title, body, index };
}

/**
 * Draft all sections with up to MAX_CONCURRENT_SECTIONS concurrent requests.
 */
async function draftAllSections(
  client: Anthropic,
  topic: string,
  sections: OutlineSection[]
): Promise<SectionDraft[]> {
  const results: SectionDraft[] = [];
  const queue = sections.map((section, index) => ({ section, index }));

  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_CONCURRENT_SECTIONS);
    const batchResults = await Promise.all(
      batch.map(({ section, index }) => draftSection(client, topic, section, index))
    );
    results.push(...batchResults);
  }

  // Restore original order (Promise.all preserves batch order; batches are sequential)
  return results.sort((a, b) => a.index - b.index);
}

// ─── Pass 3: Cross-section synthesis ─────────────────────────────────────────

async function synthesize(
  client: Anthropic,
  topic: string,
  sections: SectionDraft[]
): Promise<Synthesis> {
  const sectionsBlock = sections
    .map((s) => `## ${s.title}\n\n${s.body}`)
    .join('\n\n---\n\n');

  const res = await client.messages.create({
    model: DEEP_RESEARCH_MODEL,
    max_tokens: 2000,
    system: `You are a senior research director producing an executive synthesis.
Return ONLY valid JSON — no markdown fences, no commentary.
The JSON must exactly match this shape:
{
  "executive_summary": "300-500 word cohesive synthesis paragraph(s)",
  "key_insights": ["Insight 1", "Insight 2", "Insight 3"],
  "open_questions": ["Open question 1", "Open question 2", "Open question 3"],
  "actionable_recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}`,
    messages: [
      {
        role: 'user',
        content: `Review these research sections on "${topic}" and synthesize a cohesive executive summary.

${sectionsBlock}

Produce:
- A 300-500 word executive summary capturing key findings, tensions, and recommendations across all sections.
- Exactly 3 key insights (surprising or high-signal findings).
- Exactly 3 open questions that remain unanswered or deserve further investigation.
- Exactly 3 actionable recommendations for the research sponsor.`,
      },
    ],
  });

  const raw = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(jsonStr) as Synthesis;
  } catch (err) {
    console.error('[deep-research] synthesis parse error', err, jsonStr.slice(0, 300));
    // Fallback: return raw text as executive summary
    return {
      executive_summary: raw,
      key_insights: [],
      open_questions: [],
      actionable_recommendations: [],
    };
  }
}

// ─── Pass 4: Citation extraction (post-processing) ────────────────────────────

function buildSourcesDoc(sections: SectionDraft[]): string {
  const allSources: ExtractedSource[] = [];

  for (const section of sections) {
    const sectionSources = extractSources(section.title, section.body);
    allSources.push(...sectionSources);
  }

  if (allSources.length === 0) {
    return '# Sources\n\nNo inline citations found in this research brief.\n';
  }

  // De-duplicate by reference (case-insensitive)
  const seen = new Set<string>();
  const deduped = allSources.filter((s) => {
    const key = s.reference.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rows = deduped.map(
    (s, i) =>
      `| ${i + 1} | ${s.reference} | ${s.section} | ${s.claim_context.replace(/\|/g, '\\|').slice(0, 100)}... |`
  );

  return [
    '# Sources',
    '',
    '| # | Reference | Section | Claim context |',
    '|---|-----------|---------|---------------|',
    ...rows,
    '',
  ].join('\n');
}

// ─── Output assembly ──────────────────────────────────────────────────────────

function buildBriefDoc(
  topic: string,
  slug: string,
  synthesis: Synthesis,
  sections: SectionDraft[]
): string {
  const now = new Date().toISOString();
  const insightsList = synthesis.key_insights.map((i) => `- ${i}`).join('\n');
  const questionsList = synthesis.open_questions.map((q) => `- ${q}`).join('\n');
  const recsList = synthesis.actionable_recommendations.map((r) => `- ${r}`).join('\n');

  const sectionBodies = sections
    .map((s) => `## ${s.title}\n\n${s.body}`)
    .join('\n\n---\n\n');

  return [
    `---`,
    `title: "${topic}"`,
    `slug: "${slug}"`,
    `created_at: "${now}"`,
    `model: "${DEEP_RESEARCH_MODEL}"`,
    `domain: research`,
    `status: complete`,
    `---`,
    '',
    `# ${topic}`,
    '',
    '## Executive Summary',
    '',
    synthesis.executive_summary,
    '',
    '## Key Insights',
    '',
    insightsList || '_None extracted._',
    '',
    '## Open Questions',
    '',
    questionsList || '_None extracted._',
    '',
    '## Actionable Recommendations',
    '',
    recsList || '_None extracted._',
    '',
    '---',
    '',
    '# Research Sections',
    '',
    sectionBodies,
    '',
  ].join('\n');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function deepResearch(config: DeepResearchConfig): Promise<DeepResearchResult> {
  const {
    topic,
    target_pages = 10,
    max_pages = 15,
    slug: providedSlug,
  } = config;

  const slug = providedSlug ?? topicToSlug(topic);
  const targetSections = Math.min(Math.max(target_pages, 8), max_pages);

  const client = getClient();
  let status: DeepResearchResult['status'] = 'error';

  try {
    // ── Pass 1: Outline ────────────────────────────────────────────────────
    console.log(`[deep-research] Pass 1 — generating outline for "${topic}" (${targetSections} sections)`);
    const outline = await generateOutline(client, topic, targetSections);
    const sections = outline.sections.slice(0, max_pages);
    console.log(`[deep-research] Outline ready: ${sections.length} sections`);

    // ── Pass 2: Section drafting (concurrent batches of 4) ─────────────────
    console.log(`[deep-research] Pass 2 — drafting ${sections.length} sections (max ${MAX_CONCURRENT_SECTIONS} concurrent)`);
    const draftedSections = await draftAllSections(client, topic, sections);
    console.log(`[deep-research] Section drafting complete`);

    // ── Pass 3: Synthesis ──────────────────────────────────────────────────
    console.log(`[deep-research] Pass 3 — synthesizing across ${draftedSections.length} sections`);
    const synthesis = await synthesize(client, topic, draftedSections);
    console.log(`[deep-research] Synthesis complete`);

    // ── Pass 4: Citation extraction ────────────────────────────────────────
    console.log(`[deep-research] Pass 4 — extracting citations`);
    const sourcesDoc = buildSourcesDoc(draftedSections);

    // ── Assemble output docs ───────────────────────────────────────────────
    const briefDoc = buildBriefDoc(topic, slug, synthesis, draftedSections);
    const wordCount = countWords(briefDoc);

    const now = new Date().toISOString();
    const metaJson = JSON.stringify(
      {
        topic,
        slug,
        created_at: now,
        model: DEEP_RESEARCH_MODEL,
        section_count: draftedSections.length,
        word_count: wordCount,
        status: 'complete',
      },
      null,
      2
    );

    // ── Write files ────────────────────────────────────────────────────────
    const briefPath = writeVaultFile(slug, 'brief.md', briefDoc);
    const sourcesPath = writeVaultFile(slug, 'sources.md', sourcesDoc);
    const metaPath = writeVaultFile(slug, 'meta.json', metaJson);

    console.log(`[deep-research] Written to vault: ${briefPath}`);

    status = 'complete';
    return {
      slug,
      brief_path: briefPath,
      sources_path: sourcesPath,
      meta_path: metaPath,
      section_count: draftedSections.length,
      word_count: wordCount,
      status,
    };
  } catch (err) {
    console.error('[deep-research] fatal error', err);

    // Write a partial meta.json so callers know something ran
    try {
      const errMeta = JSON.stringify(
        {
          topic,
          slug,
          created_at: new Date().toISOString(),
          model: DEEP_RESEARCH_MODEL,
          section_count: 0,
          word_count: 0,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        },
        null,
        2
      );
      const metaPath = writeVaultFile(slug, 'meta.json', errMeta);
      return {
        slug,
        brief_path: '',
        sources_path: '',
        meta_path: metaPath,
        section_count: 0,
        word_count: 0,
        status: 'error',
      };
    } catch {
      // If even the error write fails, return a clean error shape
      return {
        slug,
        brief_path: '',
        sources_path: '',
        meta_path: '',
        section_count: 0,
        word_count: 0,
        status: 'error',
      };
    }
  }
}
