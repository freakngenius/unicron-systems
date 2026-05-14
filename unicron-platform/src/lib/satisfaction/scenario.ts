// src/lib/satisfaction/scenario.ts — Sprint 9 Phase 0
// Scenario loader per Addendum 4 §2.3. Parses YAML frontmatter + six narrative
// sections (Setup, User action, Expected behavior, Refusal cases, Evaluation,
// Notes). Missing optional sections degrade gracefully; missing required
// frontmatter fields throw a typed error.

import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScenarioStatus = 'active' | 'superseded' | 'draft';
export type ScenarioPriority = 'smoke' | 'regression' | 'production-gate' | 'irreversible';

export interface ScenarioFrontmatter {
  type: 'scenario';
  surface: string;
  status: ScenarioStatus;
  priority: ScenarioPriority;
  created: string;
  last_validated?: string;
  /**
   * Per-scenario satisfaction threshold. Optional; when omitted, the gate
   * falls back to its own default (typically 0.85). We deliberately do NOT
   * pre-fill a default here so callers can distinguish "scenario chose 0.85"
   * from "scenario chose nothing."
   */
  satisfaction_threshold?: number;
  ttl_days: string | number;
  related_specs?: string[];
  [key: string]: unknown;
}

export interface ScenarioSections {
  setup?: string;
  userAction?: string;
  expectedBehavior?: string;
  refusalCases?: string;
  evaluation?: string;
  notes?: string;
}

export interface Scenario {
  path: string;
  title: string;
  frontmatter: ScenarioFrontmatter;
  sections: ScenarioSections;
  rawBody: string;
}

export class ScenarioParseError extends Error {
  readonly path: string;
  readonly field?: string;

  constructor(message: string, path: string, field?: string) {
    super(`[scenario:${path}] ${message}${field ? ` (field: ${field})` : ''}`);
    this.name = 'ScenarioParseError';
    this.path = path;
    this.field = field;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and parse a scenario file from disk.
 */
export async function loadScenario(filePath: string): Promise<Scenario> {
  const raw = await readFile(filePath, 'utf-8');
  return parseScenario(raw, filePath);
}

/**
 * Parse a scenario from its raw markdown content. `filePath` is only used for
 * error messages and the returned `path` field.
 */
export function parseScenario(raw: string, filePath: string): Scenario {
  const { frontmatter, body } = splitFrontmatter(raw, filePath);
  const fm = parseFrontmatter(frontmatter, filePath);
  const { title, sections } = parseSections(body);

  return {
    path: filePath,
    title,
    frontmatter: fm,
    sections,
    rawBody: body,
  };
}

// ---------------------------------------------------------------------------
// Frontmatter split
// ---------------------------------------------------------------------------

function splitFrontmatter(raw: string, filePath: string): { frontmatter: string; body: string } {
  // Normalize line endings first so the regex behaves identically on Windows-
  // authored scenario files.
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new ScenarioParseError('missing frontmatter delimiter (--- on first line)', filePath);
  }
  const closeIdx = normalized.indexOf('\n---', 4);
  if (closeIdx === -1) {
    throw new ScenarioParseError('unterminated frontmatter block', filePath);
  }
  const frontmatter = normalized.slice(4, closeIdx);
  const body = normalized.slice(closeIdx + 4).replace(/^\n+/, '');
  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Minimal YAML parser
// ---------------------------------------------------------------------------
//
// We intentionally do not pull a YAML dependency. Scenario frontmatter is
// deliberately simple per §2.3 — string scalars, numbers, and one-line bracket
// arrays. A small purpose-built parser keeps the surface area tight.

function parseFrontmatter(text: string, filePath: string): ScenarioFrontmatter {
  const raw: Record<string, unknown> = {};
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      throw new ScenarioParseError(`malformed frontmatter line: "${line}"`, filePath);
    }
    const key = line.slice(0, colonIdx).trim();
    const valueRaw = stripInlineComment(line.slice(colonIdx + 1)).trim();

    raw[key] = parseScalarOrList(valueRaw);
  }

  // Validate required fields.
  const requiredString = (k: string): string => {
    const v = raw[k];
    if (typeof v !== 'string' || v.length === 0) {
      throw new ScenarioParseError(`required field missing or not a string`, filePath, k);
    }
    return v;
  };

  const type = requiredString('type');
  if (type !== 'scenario') {
    throw new ScenarioParseError(`type must be "scenario", got "${type}"`, filePath, 'type');
  }

  const surface = requiredString('surface');
  const status = requiredString('status') as ScenarioStatus;
  if (status !== 'active' && status !== 'superseded' && status !== 'draft') {
    throw new ScenarioParseError(`invalid status "${status}"`, filePath, 'status');
  }
  const priority = requiredString('priority') as ScenarioPriority;
  const validPriorities: ScenarioPriority[] = ['smoke', 'regression', 'production-gate', 'irreversible'];
  if (!validPriorities.includes(priority)) {
    throw new ScenarioParseError(`invalid priority "${priority}"`, filePath, 'priority');
  }
  const created = requiredString('created');

  const thresholdRaw = raw['satisfaction_threshold'];
  let satisfaction_threshold: number | undefined;
  if (thresholdRaw === undefined || thresholdRaw === null) {
    satisfaction_threshold = undefined;
  } else if (typeof thresholdRaw === 'number') {
    if (thresholdRaw < 0 || thresholdRaw > 1) {
      throw new ScenarioParseError(
        `satisfaction_threshold must be between 0 and 1, got ${thresholdRaw}`,
        filePath,
        'satisfaction_threshold',
      );
    }
    satisfaction_threshold = thresholdRaw;
  } else {
    throw new ScenarioParseError(
      `satisfaction_threshold must be a number, got ${typeof thresholdRaw}`,
      filePath,
      'satisfaction_threshold',
    );
  }

  const ttl_days = raw['ttl_days'];
  if (ttl_days === undefined) {
    throw new ScenarioParseError('required field missing', filePath, 'ttl_days');
  }
  if (typeof ttl_days !== 'string' && typeof ttl_days !== 'number') {
    throw new ScenarioParseError(
      `ttl_days must be string or number, got ${typeof ttl_days}`,
      filePath,
      'ttl_days',
    );
  }

  const last_validated = typeof raw['last_validated'] === 'string' ? raw['last_validated'] : undefined;
  const related_specs = Array.isArray(raw['related_specs'])
    ? (raw['related_specs'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : undefined;

  const fm: ScenarioFrontmatter = {
    type: 'scenario',
    surface,
    status,
    priority,
    created,
    ttl_days,
    ...(satisfaction_threshold !== undefined ? { satisfaction_threshold } : {}),
    ...(last_validated !== undefined ? { last_validated } : {}),
    ...(related_specs !== undefined ? { related_specs } : {}),
  };

  // Preserve any extra keys (forward compatibility) without overriding required ones.
  for (const k of Object.keys(raw)) {
    if (!(k in fm)) {
      fm[k] = raw[k];
    }
  }

  return fm;
}

function stripInlineComment(s: string): string {
  // Naive: strip an unquoted `#` to end of line. Frontmatter values are simple
  // enough that we don't need a real tokenizer.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      return s.slice(0, i);
    }
  }
  return s;
}

function parseScalarOrList(value: string): unknown {
  if (value === '') return '';
  // Bracket list: [a, b, "c, d"]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevelCommas(inner).map((item) => parseScalarOrList(item.trim()));
  }
  // Quoted strings
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  // Booleans
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  return value;
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        out.push(s.slice(start, i));
        start = i + 1;
      }
    }
  }
  out.push(s.slice(start));
  return out;
}

// ---------------------------------------------------------------------------
// Section parser
// ---------------------------------------------------------------------------

const SECTION_KEYS: Record<string, keyof ScenarioSections> = {
  setup: 'setup',
  'user action': 'userAction',
  'expected behavior': 'expectedBehavior',
  'refusal cases': 'refusalCases',
  evaluation: 'evaluation',
  notes: 'notes',
};

function parseSections(body: string): { title: string; sections: ScenarioSections } {
  const lines = body.split('\n');
  let title = '';
  const sections: ScenarioSections = {};
  let currentKey: keyof ScenarioSections | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentKey) {
      const text = buf.join('\n').trim();
      if (text.length > 0) {
        sections[currentKey] = text;
      }
    }
    buf = [];
  };

  for (const line of lines) {
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h1 && !title) {
      title = h1[1].trim();
      continue;
    }
    if (h2) {
      flush();
      const heading = h2[1].trim().toLowerCase();
      currentKey = SECTION_KEYS[heading] ?? null;
      continue;
    }
    if (currentKey) {
      buf.push(line);
    }
  }
  flush();

  return { title, sections };
}
