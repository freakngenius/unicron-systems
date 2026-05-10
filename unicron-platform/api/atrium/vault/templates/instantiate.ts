// POST /api/atrium/vault/templates/instantiate
// Body: { template: 'prd' | 'spec' | 'prompt' | 'retro' | 'decision' }
// Creates a new file in unicron-knowledge/wiki/inbox/ with prefilled frontmatter.
// Commits to vault repo. Returns { slug }.
// Sprint 6 Stream C.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const VALID_TEMPLATES = ['prd', 'spec', 'prompt', 'retro', 'decision'] as const;
type TemplateType = (typeof VALID_TEMPLATES)[number];

function isValidTemplate(t: unknown): t is TemplateType {
  return VALID_TEMPLATES.includes(t as TemplateType);
}

const TEMPLATE_TITLES: Record<TemplateType, string> = {
  prd: 'Product Requirements Document',
  spec: 'Technical Specification',
  prompt: 'Agent Prompt',
  retro: 'Sprint Retrospective',
  decision: 'Decision Record',
};

const TEMPLATE_BODY: Record<TemplateType, string> = {
  prd: `## Problem

_What pain does this solve? Quantify it._

## Proposed solution

_What are we building?_

## Success criteria

- [ ] Criterion 1

## Out of scope

_What are we explicitly NOT building?_

## Open questions

_What do we still need to figure out?_
`,
  spec: `## Context

_Why does this spec exist?_

## Architecture

_Technical approach, data flow, key decisions._

## Interfaces

\`\`\`
\`\`\`

## Acceptance criteria

- [ ] Criterion 1

## Migration notes

_Schema changes, breaking changes, rollback plan._
`,
  prompt: `## Purpose

_What does this prompt accomplish?_

## Role / context

_System prompt context._

## Instructions

_Step-by-step instructions for the agent._

## Hard halt conditions

-

## Output format

_Describe expected output structure._
`,
  retro: `## What shipped

-

## What didn't ship (and why)

-

## What we learned

-

## Next sprint setup

-

## Taboo overrides this sprint

None.
`,
  decision: `## Status

Proposed

## Context

_What problem are we solving? What is the current state?_

## Decision

_What did we decide?_

## Consequences

_What are the trade-offs and implications?_

## Alternatives considered

_What else did we consider and why did we reject it?_
`,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildFrontmatter(template: TemplateType, slug: string): string {
  const today = todayISO();
  return `---
type: ${template}
title: ${TEMPLATE_TITLES[template]}
slug: ${slug}
date: ${today}
dri: kyle
status: draft
tags: [${template}]
---\n\n`;
}

function gitCommit(vaultRoot: string, filePath: string, message: string): void {
  const relPath = path.relative(vaultRoot, filePath);
  execSync(`git -C "${vaultRoot}" add "${relPath}"`, { stdio: 'pipe' });
  execSync(`git -C "${vaultRoot}" commit -m "${message.replace(/"/g, "'")}"`, {
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Atrium Templates',
      GIT_AUTHOR_EMAIL: 'atrium@unicron.systems',
      GIT_COMMITTER_NAME: 'Atrium Templates',
      GIT_COMMITTER_EMAIL: 'atrium@unicron.systems',
    },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) {
    res.status(503).json({ error: 'VAULT_PATH not configured' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const template = body?.template;

  if (!isValidTemplate(template)) {
    res.status(400).json({
      error: `Invalid template. Must be one of: ${VALID_TEMPLATES.join(', ')}`,
    });
    return;
  }

  // Generate slug: inbox/<template>-<date>-<random4>
  const today = todayISO();
  const rand = Math.random().toString(36).slice(2, 6);
  const slug = `inbox/${template}-${today}-${rand}`;

  const inboxDir = path.join(vaultPath, 'wiki', 'inbox');
  const filePath = path.join(inboxDir, `${template}-${today}-${rand}.md`);

  // Safety check
  if (!filePath.startsWith(path.resolve(path.join(vaultPath, 'wiki')))) {
    res.status(403).json({ error: 'path traversal denied' });
    return;
  }

  const content = buildFrontmatter(template, slug) + TEMPLATE_BODY[template];

  try {
    fs.mkdirSync(inboxDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `failed to create file: ${msg}` });
    return;
  }

  let committed = false;
  try {
    gitCommit(vaultPath, filePath, `wiki: new ${template} from Atrium template`);
    committed = true;
  } catch (err) {
    console.warn('[vault/templates/instantiate] git commit failed:', err instanceof Error ? err.message : err);
  }

  res.status(201).json({ slug, committed });
}
