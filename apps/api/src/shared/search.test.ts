import { describe, it, expect } from 'vitest';
import { toContainsPattern, naturalOrder } from './search';

describe('toContainsPattern', () => {
  it('wraps the term in % wildcards', () => {
    expect(toContainsPattern('murugan')).toBe('%murugan%');
  });

  it('trims surrounding whitespace', () => {
    expect(toContainsPattern('  300 ')).toBe('%300%');
  });

  it('escapes LIKE wildcards so they match literally', () => {
    expect(toContainsPattern('50%_off')).toBe('%50\\%\\_off%');
  });

  it('escapes the escape character itself', () => {
    expect(toContainsPattern('a\\b')).toBe('%a\\\\b%');
  });
});

describe('naturalOrder', () => {
  it('sorts numeric values numerically before falling back to text', () => {
    expect(naturalOrder('g.chit_number')).toBe(
      "(CASE WHEN g.chit_number ~ '^[0-9]+$' THEN g.chit_number::numeric END) ASC NULLS LAST, g.chit_number ASC"
    );
  });
});
