// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Intent classification parser tests
 *
 * Pure parsing tests for the AUX-LLM intent classifier. The full async
 * `classifyIntent` (which calls the provider) is covered by integration
 * tests in `tests/`; here we verify that the response parser correctly
 * clamps confidence to `[0, 1]` so downstream heuristics that branch on
 * confidence thresholds cannot be tricked by out-of-range or non-finite
 * input (e.g. prompt-injected tool-result JSON).
 */
import { describe, expect, it, } from "bun:test";

import { parseIntentClassification, } from "./classify-intent";

describe("parseIntentClassification", () => {
  it("parses a valid response", () => {
    const result = parseIntentClassification(
      '{"intent":"chat","confidence":0.8,"shortReply":false}',
    );

    expect(result,).not.toBeNull();
    expect(result?.intent,).toBe("chat",);
    expect(result?.confidence,).toBeCloseTo(0.8,);
    expect(result?.shortReply,).toBe(false,);
  });

  it("clamps confidence above 1 to 1", () => {
    const result = parseIntentClassification(
      '{"intent":"chat","confidence":1.5,"shortReply":false}',
    );

    expect(result?.confidence,).toBe(1,);
  });

  it("clamps confidence below 0 to 0", () => {
    const result = parseIntentClassification(
      '{"intent":"chat","confidence":-0.5,"shortReply":false}',
    );

    expect(result?.confidence,).toBe(0,);
  });

  it("falls back to 0.5 when confidence is NaN (string)", () => {
    const result = parseIntentClassification(
      '{"intent":"chat","confidence":"0.8","shortReply":false}',
    );

    // Non-number input falls back to 0.5 per the type guard `typeof === "number"`.
    expect(result?.confidence,).toBe(0.5,);
  });

  it("falls back to 0.5 when confidence is null", () => {
    const result = parseIntentClassification(
      '{"intent":"chat","confidence":null,"shortReply":false}',
    );

    expect(result?.confidence,).toBe(0.5,);
  });

  it("preserves exact 0.0 and 1.0 bounds", () => {
    expect(parseIntentClassification('{"intent":"a","confidence":0}',)?.confidence,).toBe(0,);
    expect(parseIntentClassification('{"intent":"a","confidence":1}',)?.confidence,).toBe(1,);
  });

  it("returns null when intent is missing", () => {
    expect(parseIntentClassification('{"confidence":0.8}',),).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseIntentClassification("not json at all",),).toBeNull();
  });
});
