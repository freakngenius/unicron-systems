// @vitest-environment jsdom
//
// tests/source-chip.test.tsx — Demo Polish UX Gate 11C.
//
// Per-source color coding + display capitalization for the Source Record
// section's heading chip.

import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { SourceChip } from '@/components/lead/SourceChip';

afterEach(() => cleanup());

describe('SourceChip — known sources', () => {
  it('renders sam.gov chip with the canonical label', () => {
    render(<SourceChip source="sam.gov" />);
    const chip = screen.getByTestId('source-chip');
    expect(chip).toHaveAttribute('data-source', 'sam.gov');
    expect(chip).toHaveTextContent('sam.gov');
  });

  it('renders USAspending with display capitalization (not raw lowercase)', () => {
    render(<SourceChip source="usaspending" />);
    const chip = screen.getByTestId('source-chip');
    expect(chip).toHaveAttribute('data-source', 'usaspending');
    expect(chip).toHaveTextContent('USAspending');
  });

  it('renders Harris County chip', () => {
    render(<SourceChip source="harris" />);
    const chip = screen.getByTestId('source-chip');
    expect(chip).toHaveTextContent('Harris County');
  });

  it('renders News chip', () => {
    render(<SourceChip source="news" />);
    expect(screen.getByTestId('source-chip')).toHaveTextContent('News');
  });
});

describe('SourceChip — fallback + edge cases', () => {
  it('renders nothing when source is null', () => {
    const { container } = render(<SourceChip source={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when source is undefined', () => {
    const { container } = render(<SourceChip source={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('falls back to neutral gray rendering for unknown sources', () => {
    render(<SourceChip source="propstream" />);
    const chip = screen.getByTestId('source-chip');
    expect(chip).toHaveAttribute('data-source', 'propstream');
    expect(chip).toHaveTextContent('propstream');
  });

  it('trims and lower-cases the data-source attribute', () => {
    render(<SourceChip source="  Sam.Gov  " />);
    const chip = screen.getByTestId('source-chip');
    expect(chip).toHaveAttribute('data-source', 'sam.gov');
  });
});

describe('SourceChip — color tints (per-source visual differentiation)', () => {
  it('applies a different color border for sam.gov vs USAspending', () => {
    const { container, unmount } = render(<SourceChip source="sam.gov" />);
    const samChip = container.querySelector('[data-testid="source-chip"]') as HTMLElement;
    const samColor = samChip.style.color;
    expect(samColor).toBeTruthy();
    unmount();

    const second = render(<SourceChip source="usaspending" />);
    const usaChip = second.container.querySelector('[data-testid="source-chip"]') as HTMLElement;
    const usaColor = usaChip.style.color;
    expect(usaColor).toBeTruthy();
    expect(usaColor).not.toBe(samColor);
  });
});
