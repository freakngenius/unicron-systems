import { describe, expect, it } from 'vitest';
import { coverageExpansionAgent } from './coverageExpansionAgent';

describe('coverageExpansionAgent', () => {
  it('exposes a stable name + a modalComponent', () => {
    expect(coverageExpansionAgent.name).toBe('coverage-expansion');
    expect(coverageExpansionAgent.displayName).toBe('Coverage Expansion');
    expect(typeof coverageExpansionAgent.modalComponent).toBe('object'); // lazy() returns an exotic component
  });

  it('agent module-load registers the agent in the central registry', async () => {
    await import('./index');
    const { getAgent } = await import('../agentRegistry');
    expect(getAgent('coverage-expansion')).toBeDefined();
  });
});
