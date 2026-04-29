// __tests__/chat/sonar.test.ts — covers the configuration check and the
// verbatim degraded-path message lock. Network calls are not exercised
// here; the chat route's integration tests will cover those paths when
// PERPLEXITY_API_KEY becomes available.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSonarConfigured, SONAR_UNCONFIGURED_MESSAGE } from '@/lib/chat/sonar';

describe('isSonarConfigured', () => {
  const originalKey = process.env.PERPLEXITY_API_KEY;
  beforeEach(() => {
    delete process.env.PERPLEXITY_API_KEY;
  });
  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.PERPLEXITY_API_KEY = originalKey;
    } else {
      delete process.env.PERPLEXITY_API_KEY;
    }
  });

  it('returns false when the key is unset', () => {
    expect(isSonarConfigured()).toBe(false);
  });
  it('returns true when the key is set', () => {
    process.env.PERPLEXITY_API_KEY = 'pk-test';
    expect(isSonarConfigured()).toBe(true);
  });
  it('returns false for empty string', () => {
    process.env.PERPLEXITY_API_KEY = '';
    expect(isSonarConfigured()).toBe(false);
  });
});

describe('SONAR_UNCONFIGURED_MESSAGE (locked verbatim per spec § 0 Q2)', () => {
  it('matches the exact spec sentence', () => {
    expect(SONAR_UNCONFIGURED_MESSAGE).toBe(
      "This question requires Perplexity Sonar research, which is not yet configured. Available now: ask me anything about the dashboard's existing data, or use me to draft and refine outreach.",
    );
  });
  it('contains no em-dash or en-dash', () => {
    expect(/[—–]/.test(SONAR_UNCONFIGURED_MESSAGE)).toBe(false);
  });
});
