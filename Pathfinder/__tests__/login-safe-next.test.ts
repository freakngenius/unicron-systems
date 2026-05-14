import { describe, it, expect } from 'vitest';
import { safeNext } from '../app/login/safe-next';

describe('safeNext — magic-link redirect sanitizer (seam #6)', () => {
  it('returns "/" when next is undefined', () => {
    expect(safeNext(undefined)).toBe('/');
  });

  it('returns "/" when next is null', () => {
    expect(safeNext(null)).toBe('/');
  });

  it('returns "/" when next is empty string', () => {
    expect(safeNext('')).toBe('/');
  });

  it('accepts a same-origin slug path', () => {
    expect(safeNext('/zedcor')).toBe('/zedcor');
    expect(safeNext('/customers/testcorp-12345')).toBe('/customers/testcorp-12345');
  });

  it('accepts paths with query strings', () => {
    expect(safeNext('/leads?stage=verified')).toBe('/leads?stage=verified');
  });

  it('rejects protocol-relative paths (open redirect via //evil.com)', () => {
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('//evil.com/path')).toBe('/');
  });

  it('rejects absolute URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('http://evil.com/path')).toBe('/');
  });

  it('rejects paths that do not start with "/"', () => {
    expect(safeNext('zedcor')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
  });

  it('rejects overly long paths to bound the redirect URL', () => {
    expect(safeNext('/' + 'a'.repeat(600))).toBe('/');
  });
});
