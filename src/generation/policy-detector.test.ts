import { describe, expect, test, } from "bun:test";
import {
  clearDetectors,
  detectPolicyMismatch,
  registerDefaultNullDetector,
  registerPolicyDetector,
} from "./policy-detector";

interface DetectorResult {
  detected?: boolean;
  confidence?: number;
  indicators?: PolicyAnalysis["indicators"];
}

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
  test("null detector reports no mismatch", async () => {
    clearDetectors();
    registerDefaultNullDetector();
    const result = await detectPolicyMismatch("anything at all", DEFAULT_POLICY_DETECTION,);
    expect(result.detected,).toBe(false,);
    expect(result.confidence,).toBeCloseTo(0,);
  });

  test("registered detector fires on match", async () => {
    clearDetectors();
    registerPolicyDetector(makeDetector("keyword", { detected: true, confidence: 0.9, },),);
    const result = await detectPolicyMismatch("this is ban", DEFAULT_POLICY_DETECTION,);
    expect(result.detected,).toBe(true,);
    expect(result.confidence,).toBeCloseTo(0.9,);
  });

  test("disabled config short-circuits before detection", async () => {
    clearDetectors();
    registerPolicyDetector(makeDetector("always", { detected: true, confidence: 1, },),);
    const result = await detectPolicyMismatch("this is ban", {
      ...DEFAULT_POLICY_DETECTION,
      enabled: false,
    },);
    expect(result.detected,).toBe(false,);
  });

  test("first positive detector short-circuits", async () => {
    clearDetectors();
    registerPolicyDetector(makeDetector("first", { detected: true, confidence: 0.5, },),);
    registerPolicyDetector(makeDetector("second", { detected: true, confidence: 0.99, },),);
    const result = await detectPolicyMismatch("content", DEFAULT_POLICY_DETECTION,);
    expect(result.confidence,).toBeCloseTo(0.5,);
  });

  test("clearDetectors removes all", async () => {
    clearDetectors();
    const result = await detectPolicyMismatch("content", DEFAULT_POLICY_DETECTION,);
    expect(result.detected,).toBe(false,);
  });
});
