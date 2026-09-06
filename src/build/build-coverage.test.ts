import { describe, expect, it } from 'bun:test';

// Extract stripTestIds logic for testing (same implementation as build/compress.ts)
function stripTestIds(content: string): string {
  let result = content.replaceAll(/\s+data-testid="[^"]*"/g, '');
  result = result.replaceAll(/\s+:data-testid="[^"]*"/g, '');
  return result;
}

describe('build stripTestIds', () => {
  it('removes data-testid attributes', () => {
    const html = '<div data-testid="foo">bar</div>';
    expect(stripTestIds(html)).toBe('<div>bar</div>');
  });

  it('removes :data-testid attributes', () => {
    const html = '<span :data-testid="baz">qux</span>';
    expect(stripTestIds(html)).toBe('<span>qux</span>');
  });

  it('leaves content without testids unchanged', () => {
    expect(stripTestIds('<p>hello</p>')).toBe('<p>hello</p>');
  });
});
