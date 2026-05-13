// __tests__/architect/decomposition-prompt-shape.test.ts — Build-Out Pass Slice 1.
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md
//   §"Architect prompt extension".
//
// Asserts the decomposition system prompt instructs the Architect to emit
// a `ui_plan` object alongside the existing decomposition + business_summary
// output, and that the prompt version is bumped to the Build-Out Pass v4 tag.

import { describe, expect, it } from 'vitest';
import {
  DECOMPOSITION_PROMPT_VERSION,
  DECOMPOSITION_SYSTEM_PROMPT,
} from '@/services/architect/prompts/decomposition';

const EMPHASIS_VALUES = ['volume', 'quality', 'velocity', 'coverage'] as const;

describe('decomposition system prompt — Build-Out Pass Slice 1', () => {
  it('bumps DECOMPOSITION_PROMPT_VERSION to the v4 Build-Out tag', () => {
    expect(DECOMPOSITION_PROMPT_VERSION).toBe('2026-05-13-v4');
  });

  it('includes the ui_plan generation instruction', () => {
    expect(DECOMPOSITION_SYSTEM_PROMPT).toContain('ui_plan');
  });

  it('mentions dashboard_emphasis selection', () => {
    expect(DECOMPOSITION_SYSTEM_PROMPT).toContain('dashboard_emphasis');
  });

  it('lists at least one of the four emphasis values', () => {
    const hit = EMPHASIS_VALUES.some((value) =>
      DECOMPOSITION_SYSTEM_PROMPT.includes(value),
    );
    expect(hit).toBe(true);
  });

  it('still carries the existing business_summary instruction (additive only)', () => {
    expect(DECOMPOSITION_SYSTEM_PROMPT).toContain('business_summary');
  });
});
