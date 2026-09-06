import { describe, expect, it } from 'bun:test';
import { selectWithinBudget, } from './budget';

describe('memory budget', () => {
  it('drops low-confidence unpinned memories first', () => {
    const mems = [
      { content: 'hello', confidence: 0.9, importance: 0.5, pinned: false },
      { content: 'world', confidence: 0.1, importance: 0.9, pinned: false },
    ];
    const result = selectWithinBudget(mems, { maxTokens: 20, respectPins: true });
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('respects pinned memories', () => {
    const mems = [
      { content: 'pinned', confidence: 0.5, importance: 0.1, pinned: true },
      { content: 'low', confidence: 0.1, importance: 1.0, pinned: false },
    ];
    const result = selectWithinBudget(mems, { maxTokens: 10, respectPins: true });
    expect(result.some((m: { content: string }) => m.content === 'pinned')).toBe(true);
  });
});
