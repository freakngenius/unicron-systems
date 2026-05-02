// Canonical customer-name normalizer for the Zedcor cross-pollination engine.
// Single source of truth shared by:
//   - scripts/seed-zedcor.ts (ingestion)
//   - lib/cross-pollination/* (matching engine, Z-B)
//
// Rules per SPEC - Cross-Pollination Engine.md § 3.1 and
// SPEC - Zedcor Data Ingestion.md § 5.

// End-of-string suffixes (high confidence; strip without context).
const TRAILING_SUFFIX_PATTERNS: RegExp[] = [
  /\s+(corporation|incorporated|limited|company)\s*$/i,
  /\s+(inc|ltd|corp|llc|llp|gp|lp|co|gmbh|ag)\.?\s*$/i,
];

// Mid-string suffixes followed by " - " (branch separator). Applies to
// names like "D.R. Horton Inc. - South Houston" where the corp suffix
// sits between the brand and the branch label. Lower confidence than
// trailing strip; only fires before " - ".
const MID_BRANCH_SUFFIX_PATTERN =
  /\s+(corporation|incorporated|limited|company|inc|ltd|corp|llc|llp|gp|lp|co|gmbh|ag)\.?(?=\s+-\s)/i;

const TRAILING_PAREN_PATTERN = /\s*\([^)]*\)\s*$/;

export function normalizeCustomerName(raw: string | null | undefined): string {
  if (!raw) return '';

  let s = raw.toLowerCase();

  // Strip "c/o ..." trailing clauses
  s = s.replace(/\s+c\/o\s+.*$/i, '');

  // Strip mid-string corp suffix before " - " (branch separator).
  s = s.replace(MID_BRANCH_SUFFIX_PATTERN, '');

  // Iteratively strip trailing parens and trailing corp suffixes — they
  // can stack (e.g., "Boxfort Ventures (AB) Ltd." needs Ltd. stripped
  // first to expose "(AB)" at end, then the paren strip).
  for (let i = 0; i < 4; i += 1) {
    let changed = false;
    for (const re of TRAILING_SUFFIX_PATTERNS) {
      const next = s.replace(re, '');
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
    const afterParen = s.replace(TRAILING_PAREN_PATTERN, '');
    if (afterParen !== s) {
      s = afterParen;
      changed = true;
    }
    if (!changed) break;
  }

  // Remove punctuation except hyphens and slashes (slashes preserved for
  // names like "ARCO Design/Build" where the slash carries meaning)
  s = s.replace(/[.,;:'"&]/g, '');

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// Common-prefix parent-company resolver (heuristic per
// SPEC - Zedcor Data Ingestion.md § 6).
//
// Given a list of pre-normalized customer names, group by first 3 words and
// for each group of size > 1, compute the longest common word-prefix. If
// that prefix is >= 4 chars and not in the GENERIC_PREFIX_DENYLIST, assign
// it as parent_company_canonical for every name in the group.
//
// Returns a Map<normalized_name, parent_canonical | null>.

const GENERIC_PREFIX_DENYLIST = new Set([
  'the', 'a', 'an',
  'north', 'south', 'east', 'west',
  'new', 'old', 'big', 'small',
  'city', 'county', 'state',
  'first', 'last', 'main',
  'us', 'usa', 'canada',
]);

export function resolveParentCompanies(normalizedNames: string[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const groups = new Map<string, string[]>();

  for (const name of normalizedNames) {
    if (!name) {
      result.set(name, null);
      continue;
    }
    // Bucket by first word; longest-common-word-prefix below extracts the
    // multi-word parent (e.g., "dr horton south houston" + "dr horton
    // dallas" both bucket on "dr", common prefix resolves to "dr horton").
    const key = name.split(' ', 1)[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(name);
  }

  for (const [, members] of groups) {
    if (members.length < 2) {
      for (const m of members) result.set(m, null);
      continue;
    }
    const prefix = longestCommonWordPrefix(members);
    if (
      prefix &&
      prefix.length >= 4 &&
      !GENERIC_PREFIX_DENYLIST.has(prefix.split(' ')[0])
    ) {
      for (const m of members) result.set(m, prefix);
    } else {
      for (const m of members) result.set(m, null);
    }
  }

  return result;
}

function longestCommonWordPrefix(names: string[]): string {
  if (names.length === 0) return '';
  const wordLists = names.map((n) => n.split(' '));
  const minLen = Math.min(...wordLists.map((w) => w.length));
  const prefixWords: string[] = [];
  for (let i = 0; i < minLen; i += 1) {
    const w = wordLists[0][i];
    if (wordLists.every((wl) => wl[i] === w)) prefixWords.push(w);
    else break;
  }
  return prefixWords.join(' ');
}
