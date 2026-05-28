// lib/adapters/zedcor/type-tag-inferrer.ts
//
// Sprint Z4 — pure utility. Infers project type tags from title + summary
// via keyword matching. Fed into the pitch-hook generator so Sonnet can
// reference a concrete project archetype (linear_infrastructure, school,
// hospital, etc).
//
// Spec: SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 2".

export type ZedcorTypeTag =
  | 'linear_infrastructure'
  | 'school'
  | 'hospital'
  | 'recreation'
  | 'renovation'
  | 'vertical_build';

interface TagRule {
  tag: ZedcorTypeTag;
  patterns: RegExp[];
}

const RULES: TagRule[] = [
  {
    tag: 'linear_infrastructure',
    patterns: [/\blevee\b/i, /\bhighway\b/i, /\broadway\b/i, /\bpipeline\b/i, /\bcorridor\b/i, /\bbridge\b/i],
  },
  {
    tag: 'school',
    patterns: [/\bschool\b/i, /\bISD\b/, /\bclassroom\b/i, /\bcampus\b/i],
  },
  {
    tag: 'hospital',
    patterns: [/\bhospital\b/i, /\bmedical\b/i, /\bclinic\b/i, /\bhealth (system|center)\b/i],
  },
  {
    tag: 'recreation',
    patterns: [/\bpark\b/i, /\bplayground\b/i, /\bball ?field\b/i, /\bsports complex\b/i, /\btrail\b/i],
  },
  {
    tag: 'renovation',
    patterns: [/\brenovation\b/i, /\brehab\b/i, /\brepair\b/i, /\bretrofit\b/i, /\brestoration\b/i],
  },
  {
    tag: 'vertical_build',
    patterns: [/\bnew construction\b/i, /\bnew build\b/i, /\bannex\b/i, /\baddition\b/i, /\b(office|admin) building\b/i],
  },
];

export function inferTypeTags(args: { title: string | null | undefined; summary?: string | null | undefined }): ZedcorTypeTag[] {
  const text = [args.title ?? '', args.summary ?? ''].join(' ').trim();
  if (!text) return [];
  const hits: ZedcorTypeTag[] = [];
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(text))) hits.push(rule.tag);
  }
  return hits;
}
