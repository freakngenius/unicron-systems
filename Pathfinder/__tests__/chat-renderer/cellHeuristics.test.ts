import { describe, it, expect } from 'vitest';
import {
  detectCellKind,
  formatCurrency,
  parseScore,
  scoreToneFor,
  splitDistance,
  stageToneFor,
} from '@/components/chat/markdown/cellHeuristics';

describe('detectCellKind', () => {
  it.each([
    ['Score', 'score'],
    ['SCORE', 'score'],
    ['lead score', 'score'],
    ['Rank', 'score'],
    ['Value', 'currency'],
    ['Project value', 'currency'],
    ['Budget', 'currency'],
    ['Stage', 'stage'],
    ['Project stage', 'stage'],
    ['Status', 'stage'],
    ['Distance', 'distance'],
    ['Distance (mi)', 'distance'],
    ['Project', 'id'],
    ['Project ID', 'id'],
    ['ID', 'id'],
    ['Title', 'title'],
    ['Project Name', 'title'],
    ['Region', 'plain'],
    ['Notes', 'plain'],
  ])('maps header %s → %s', (header, kind) => {
    expect(detectCellKind(header)).toBe(kind);
  });

  it('falls back to currency when sample cell starts with $', () => {
    expect(detectCellKind('Foo', '$4,500')).toBe('currency');
  });
});

describe('parseScore + scoreToneFor', () => {
  it('parses numeric strings', () => {
    expect(parseScore('92')).toBe(92);
    expect(parseScore('  88 ')).toBe(88);
  });
  it('returns null for non-numeric', () => {
    expect(parseScore('high')).toBeNull();
    expect(parseScore('')).toBeNull();
  });
  it('classifies tone by threshold', () => {
    expect(scoreToneFor(95)).toBe('green');
    expect(scoreToneFor(90)).toBe('green');
    expect(scoreToneFor(85)).toBe('amber');
    expect(scoreToneFor(80)).toBe('amber');
    expect(scoreToneFor(79)).toBe('red');
    expect(scoreToneFor(0)).toBe('red');
  });
});

describe('formatCurrency', () => {
  it('passes through pre-formatted shorthand', () => {
    expect(formatCurrency('$4.2M')).toBe('$4.2M');
    expect(formatCurrency('$880K')).toBe('$880K');
    expect(formatCurrency('4.2M')).toBe('$4.2M');
  });
  it('reformats raw numbers into shorthand', () => {
    expect(formatCurrency('4200000')).toBe('$4.20M');
    expect(formatCurrency('$12,400')).toBe('$12K');
    expect(formatCurrency('410')).toBe('$410');
  });
  it('em-dashes empty values', () => {
    expect(formatCurrency('')).toBe('—');
    expect(formatCurrency('—')).toBe('—');
    expect(formatCurrency('-')).toBe('—');
  });
  it('passes through unparseable values', () => {
    expect(formatCurrency('TBD')).toBe('TBD');
  });
});

describe('stageToneFor', () => {
  it('classifies common stages', () => {
    expect(stageToneFor('RFP')).toBe('progress');
    expect(stageToneFor('AWARDED')).toBe('won');
    expect(stageToneFor('DRAFT')).toBe('neutral');
    expect(stageToneFor('PRE')).toBe('soft');
    expect(stageToneFor('in review')).toBe('progress');
  });
  it('falls back to neutral for unknown stages', () => {
    expect(stageToneFor('XYZ')).toBe('neutral');
  });
});

describe('splitDistance', () => {
  it('splits value + unit', () => {
    expect(splitDistance('6.2 mi')).toEqual({ value: '6.2', unit: 'mi' });
    expect(splitDistance('12.4 km')).toEqual({ value: '12.4', unit: 'km' });
    expect(splitDistance('9.8')).toEqual({ value: '9.8', unit: 'mi' });
  });
  it('em-dashes empty', () => {
    expect(splitDistance('')).toEqual({ value: '—', unit: '' });
    expect(splitDistance('—')).toEqual({ value: '—', unit: '' });
  });
});
