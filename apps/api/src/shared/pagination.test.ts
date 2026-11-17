import { describe, it, expect } from 'vitest';
import { toLimitOffset, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination';

describe('toLimitOffset', () => {
  it('defaults to the first page at the default size', () => {
    expect(toLimitOffset()).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
  });

  it('computes the offset from a 1-based page', () => {
    expect(toLimitOffset({ page: 3, limit: 50 })).toEqual({ limit: 50, offset: 100 });
  });

  it('clamps the page size to the maximum', () => {
    expect(toLimitOffset({ page: 2, limit: 5000 })).toEqual({ limit: MAX_PAGE_SIZE, offset: MAX_PAGE_SIZE });
  });

  it('clamps non-positive input to the first row', () => {
    expect(toLimitOffset({ page: 0, limit: 0 })).toEqual({ limit: 1, offset: 0 });
  });
});
