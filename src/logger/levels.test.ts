/**
 * Tests for logger/levels.ts — log level mapping helpers
 */

import { describe, expect, test, } from "bun:test";
import { levelFromConfig, numericToLabel, shouldEmit, } from "./levels";

describe("levelFromConfig", () => {
  test("maps debug → 10", () => {
    expect(levelFromConfig("debug",),).toBe(10,);
  });

  test("maps info → 20", () => {
    expect(levelFromConfig("info",),).toBe(20,);
  });

  test("maps warn → 30", () => {
    expect(levelFromConfig("warn",),).toBe(30,);
  });

  test("maps error → 40", () => {
    expect(levelFromConfig("error",),).toBe(40,);
  });

  test("unknown level defaults to 20 (info)", () => {
    expect(levelFromConfig("trace" as "info",),).toBe(20,);
  });
});

describe("numericToLabel", () => {
  test("maps 10 → DEBUG", () => {
    expect(numericToLabel(10,),).toBe("DEBUG",);
  });

  test("maps 20 → INFO", () => {
    expect(numericToLabel(20,),).toBe("INFO",);
  });

  test("maps 30 → WARN", () => {
    expect(numericToLabel(30,),).toBe("WARN",);
  });

  test("maps 40 → ERROR", () => {
    expect(numericToLabel(40,),).toBe("ERROR",);
  });

  test("unknown numeric returns string", () => {
    expect(numericToLabel(99,),).toBe("99",);
  });
});

describe("shouldEmit", () => {
  test("emits when entry level >= threshold", () => {
    expect(shouldEmit(20, 10,),).toBe(true,);
    expect(shouldEmit(20, 20,),).toBe(true,);
    expect(shouldEmit(40, 20,),).toBe(true,);
  });

  test("suppresses when entry level < threshold", () => {
    expect(shouldEmit(10, 20,),).toBe(false,);
    expect(shouldEmit(10, 40,),).toBe(false,);
    expect(shouldEmit(20, 30,),).toBe(false,);
  });
});
