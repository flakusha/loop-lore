import { describe, expect, it } from 'bun:test';
import { filter, containsProfanity } from './service';

describe('profanity filter', () => {
  it('replaces profanity with asterisks', () => {
    const result = filter('fuck you');
    expect(typeof result).toBe('string');
    expect(result).toBe('*** you');
  });

  it('passes through clean text unchanged', () => {
    expect(filter('hello world')).toBe('hello world');
  });

  it('detects profanity', () => {
    expect(containsProfanity('hello')).toBe(false);
  });
});
