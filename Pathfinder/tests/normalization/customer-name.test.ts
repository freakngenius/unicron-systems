import { describe, expect, it } from 'vitest';
import { normalizeCustomerName, resolveParentCompanies } from '../../lib/normalization/customer-name';

describe('normalizeCustomerName', () => {
  it('lowercases and trims', () => {
    expect(normalizeCustomerName('  Hines  ')).toBe('hines');
  });

  it('strips Inc/LLC/Ltd/Corp suffixes', () => {
    expect(normalizeCustomerName('D.R. Horton Inc.')).toBe('dr horton');
    expect(normalizeCustomerName('ABC LLC')).toBe('abc');
    expect(normalizeCustomerName('Acme Corporation')).toBe('acme');
    expect(normalizeCustomerName('Boxfort Ventures (AB) Ltd.')).toBe('boxfort ventures');
  });

  it('strips c/o clauses', () => {
    expect(normalizeCustomerName('EllisDon Civil c/o EllisDon Corp.')).toBe('ellisdon civil');
  });

  it('handles transformations from the spec', () => {
    expect(normalizeCustomerName('D.R. Horton Inc. - South Houston')).toBe('dr horton - south houston');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeCustomerName(null)).toBe('');
    expect(normalizeCustomerName(undefined)).toBe('');
    expect(normalizeCustomerName('')).toBe('');
  });

  it('preserves slashes (semantic)', () => {
    expect(normalizeCustomerName('ARCO Design/Build')).toBe('arco design/build');
  });
});

describe('resolveParentCompanies', () => {
  it('finds parent prefix for grouped names', () => {
    const names = [
      'dr horton south houston',
      'dr horton dallas',
      'dr horton phoenix',
    ];
    const result = resolveParentCompanies(names);
    expect(result.get('dr horton south houston')).toBe('dr horton');
    expect(result.get('dr horton dallas')).toBe('dr horton');
    expect(result.get('dr horton phoenix')).toBe('dr horton');
  });

  it('returns null for singletons', () => {
    const names = ['unique customer name'];
    const result = resolveParentCompanies(names);
    expect(result.get('unique customer name')).toBeNull();
  });

  it('rejects generic prefixes', () => {
    const names = ['the home depot', 'the gap inc', 'the kraft heinz'];
    const result = resolveParentCompanies(names);
    // 'the' is in the denylist, no parent should be assigned
    expect(result.get('the home depot')).toBeNull();
  });

  it('requires prefix >= 4 chars', () => {
    const names = ['ab construction', 'ab roofing', 'ab plumbing'];
    const result = resolveParentCompanies(names);
    expect(result.get('ab construction')).toBeNull();
  });
});
