import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
  clearDetectors,
  detectPolicyMismatch,
  isolateDetectors,
  registerDefaultNullDetector,
  registerPolicyDetector,
} from "./policy-detector";
import type { PolicyDetector, } from "./policy-detector";

import { DEFAULT_POLICY_DETECTION, } from "./gen-types-options";
import type { PolicyAnalysis, } from "./gen-types-results";

interface DetectorResult {
  detected?: boolean;
  confidence?: number;
  indicators?: PolicyAnalysis["indicators"];
}

/**
 * @param name
 * @param result
 */
function makeDetector(name: string, result: DetectorResult,): PolicyDetector {
  return {
    name,
    analyze: async (_text: string, config,) => ({
      detected: result.detected ?? false,
      policy: config.expectedPolicy,
      confidence: result.confidence ?? 0,
      indicators: result.indicators ?? [],
    }),
  };
}

describe("policy-detector registry", () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    restore = isolateDetectors([],);
  },);

  afterEach(() => {
    restore();
  },);

  test("null detector reports no mismatch", async () => {
    registerDefaultNullDetector();
    const result = await detectPolicyMismatch("anything at all", DEFAULT_POLICY_DETECTION,);
    expect(result.detected,).toBe(false,);
    expect(result.confidence,).toBeCloseTo(0,);
  });

  test("registered detector fires on match", async () => {
    registerPolicyDetector(makeDetector("keyword", { detected: true, confidence: 0.9, },),);
    const result = await detectPolicyMismatch("this is ban", DEFAULT_POLICY_DETECTION,);
    expect(result.detected,).toBe(true,);
    expect(result.confidence,).toBeCloseTo(0.9,);
  });

  test("disabled config short-circuits before detection", async () => {
    registerPolicyDetector(makeDetector("always", { detected: true, confidence: 1, },),);
    const result = await detectPolicyMismatch("this is ban", {
      ...DEFAULT_POLICY_DETECTION,
      enabled: false,
    },);

    expect(result.detected,).toBe(false,);
  });

  test("first positive detector short-circuits", async () => {
    registerPolicyDetector(makeDetector("first", { detected: true, confidence: 0.5, },),);
    registerPolicyDetector(makeDetector("second", { detected: true, confidence: 0.99, },),);
    const result = await detectPolicyMismatch("content", DEFAULT_POLICY_DETECTION,);
    expect(result.confidence,).toBeCloseTo(0.5,);
  });

  test("isolateDetectors restores the previous registry", async () => {
    registerPolicyDetector(makeDetector("outer", { detected: false, confidence: 0.2, },),);
    const innerRestore = isolateDetectors([
      makeDetector("inner", { detected: true, confidence: 0.9, },),
    ],);

    const inside = await detectPolicyMismatch("content", DEFAULT_POLICY_DETECTION,);
    expect(inside.confidence,).toBeCloseTo(0.9,);

    innerRestore();
    const outside = await detectPolicyMismatch("content", DEFAULT_POLICY_DETECTION,);
    expect(outside.detected,).toBe(false,);
    expect(outside.confidence,).toBeCloseTo(0.2,);
  });

  test("clearDetectors empties the active registry", async () => {
    registerPolicyDetector(makeDetector("first", { detected: true, confidence: 0.7, },),);
    registerPolicyDetector(makeDetector("second", { detected: true, confidence: 0.4, },),);

    const before = await detectPolicyMismatch("content", DEFAULT_POLICY_DETECTION,);
    expect(before.detected,).toBe(true,);
    expect(before.confidence,).toBeCloseTo(0.7,);

    clearDetectors();

    const after = await detectPolicyMismatch("content", DEFAULT_POLICY_DETECTION,);
    expect(after.detected,).toBe(false,);
    expect(after.confidence,).toBeCloseTo(0,);
    expect(after.indicators,).toEqual([],);
  });
});
