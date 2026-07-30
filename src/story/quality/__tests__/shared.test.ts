/**
 * Story Quality Shared Utilities Tests
 */

import { describe, expect, it, } from "bun:test";
import { calculateSimilarity, extractEntities, } from "../shared";

describe("extractEntities", () => {
  it("extracts capitalized multi-word entities", () => {
    const result = extractEntities("Alice met Bob at Dark Forest.",);
    // "met" breaks the chain — Alice, Bob, and Dark Forest are separate
    expect(result.has("alice",),).toBe(true,);
    expect(result.has("bob",),).toBe(true,);
    expect(result.has("dark forest",),).toBe(true,);
  });

  it("extracts single capitalized words", () => {
    const result = extractEntities("Alice visited the castle.",);
    expect(result.has("alice",),).toBe(true,);
  });

  it("chains consecutive capitalized words", () => {
    const result = extractEntities("Alice Bob Dark Forest.",);
    expect(result.has("alice bob dark forest",),).toBe(true,);
  });

  it("returns empty set for text with no entities", () => {
    const result = extractEntities("the a an this that",);
    expect(result.size,).toBe(0,);
  });

  it("handles empty string", () => {
    const result = extractEntities("",);
    expect(result.size,).toBe(0,);
  });

  it("handles multi-word names", () => {
    const result = extractEntities("John Smith went to New York.",);
    expect(result.has("john smith",),).toBe(true,);
    expect(result.has("new york",),).toBe(true,);
  });

  it("lowercases entities", () => {
    const result = extractEntities("Dragon flew over Castle.",);
    expect(result.has("dragon",),).toBe(true,);
    expect(result.has("castle",),).toBe(true,);
  });
});

describe("calculateSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(calculateSimilarity("hello world", "hello world",),).toBe(1,);
  });

  it("returns 0.0 for completely different strings", () => {
    expect(calculateSimilarity("cat dog", "fish bird",),).toBe(0,);
  });

  it("calculates Jaccard similarity correctly", () => {
    // "a b c" vs "b c d" => intersection=2, union=4 => 0.5
    expect(calculateSimilarity("a b c", "b c d",),).toBe(0.5,);
  });

  it("is case-insensitive", () => {
    expect(calculateSimilarity("Hello World", "hello world",),).toBe(1,);
  });

  it("handles empty strings", () => {
    // Both split to [""], so they're identical => similarity 1.0
    expect(calculateSimilarity("", "",),).toBe(1,);
    expect(calculateSimilarity("hello", "",),).toBe(0,);
  });

  it("handles single word", () => {
    expect(calculateSimilarity("hello", "hello",),).toBe(1,);
    expect(calculateSimilarity("hello", "world",),).toBe(0,);
  });
});
