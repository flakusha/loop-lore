import { describe, test, expect } from "bun:test";
import { analyzeRepetition, detectTheatricalLoop } from "./repetition-detector";
import { DEFAULT_REPETITION_DETECTION } from "./types";

// Low thresholds so repetition is easy to trigger in fixtures.
const LOOSE_CONFIG = {
  enabled: true,
  autoCancel: false,
  minChars: 10,
  maxSimilarity: 0.01,
  windowSize: 100,
  minRepetitions: 2,
};

describe("analyzeRepetition", () => {
  test("returns no detection for text below minChars", () => {
    const result = analyzeRepetition("hi", DEFAULT_REPETITION_DETECTION);
    expect(result.detected).toBe(false);
    expect(result.score).toBe(0);
    expect(result.patterns).toEqual([]);
  });

  test("detects repeated n-grams", () => {
    const repeated = "ABCDEFGHIJ".repeat(4);
    const result = analyzeRepetition(repeated, LOOSE_CONFIG);
    expect(result.detected).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  test("does not flag varied text", () => {
    const varied =
      "The wizard opened the ancient tome and read the fading inscription aloud to the gathered council.";
    const result = analyzeRepetition(varied, LOOSE_CONFIG);
    expect(result.detected).toBe(false);
  });
});

describe("detectTheatricalLoop", () => {
  test("returns the expected shape", () => {
    const result = detectTheatricalLoop("Once upon a time there was a small village.");
    expect(typeof result.detected).toBe("boolean");
    expect(typeof result.score).toBe("number");
  });

  test("detects a high-ratio action-wrapped block", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `*he paced the room ${i}*`).join("\n");
    const result = detectTheatricalLoop(lines);
    expect(result.detected).toBe(true);
    expect(result.score).toBeGreaterThan(0.8);
  });

  test("ignores plain prose", () => {
    const prose = "The clock struck midnight as the raven flew across the silver moon.";
    const result = detectTheatricalLoop(prose);
    expect(result.detected).toBe(false);
  });
});
