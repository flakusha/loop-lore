import { describe, expect, it, } from "bun:test";
import {
  computeContextWindow,
  type CountableMessage,
  countMessageTokens,
  getStatus,
  THRESHOLDS,
} from "./token-counter";

/**
 * @param content
 * @param role
 */
function msg(content: string, role: CountableMessage["role"] = "user",): CountableMessage {
  return { role, content, };
}

describe("countMessageTokens", () => {
  it("returns 0 for empty list", () => {
    expect(countMessageTokens([],),).toBe(0,);
  });

  it("counts tokens across multiple messages", () => {
    const messages = [
      msg("Hello world",), // 11 chars → 3 tokens
      msg("This is a test",), // 14 chars → 4 tokens
    ];
    const result = countMessageTokens(messages,);
    expect(result,).toBe(7,); // 3 + 4
  });

  it("handles system messages", () => {
    const messages = [msg("System prompt", "system",),];
    expect(countMessageTokens(messages,),).toBeGreaterThan(0,);
  });
});

describe("getStatus", () => {
  it("returns ok for low percentages", () => {
    expect(getStatus(0,),).toBe("ok",);
    expect(getStatus(0.5,),).toBe("ok",);
    expect(getStatus(0.69,),).toBe("ok",);
  });

  it("returns warning at 70%", () => {
    expect(getStatus(THRESHOLDS.warning,),).toBe("warning",);
    expect(getStatus(0.8,),).toBe("warning",);
  });

  it("returns critical at 85%", () => {
    expect(getStatus(THRESHOLDS.critical,),).toBe("critical",);
    expect(getStatus(0.9,),).toBe("critical",);
  });

  it("returns danger at 95%", () => {
    expect(getStatus(0.95,),).toBe("danger",);
    expect(getStatus(1,),).toBe("danger",);
  });
});

describe("computeContextWindow", () => {
  it("computes full context window state", () => {
    const messages = [msg("Hello",), msg("World",),];
    const result = computeContextWindow(messages, 32_000,);

    expect(result.maxTokens,).toBe(32_000,);
    expect(result.currentTokens,).toBeGreaterThan(0,);
    expect(result.percentage,).toBeGreaterThan(0,);
    expect(result.status,).toBe("ok",);
  });

  it("uses default maxTokens of 32000", () => {
    const result = computeContextWindow([msg("test",),],);
    expect(result.maxTokens,).toBe(32_000,);
  });

  it("returns danger status for large messages", () => {
    // Create enough messages to exceed 95% of a small maxTokens
    const bigContent = "x".repeat(1000,);
    const messages = Array.from({ length: 100, }, () => msg(bigContent,),);
    const result = computeContextWindow(messages, 1000,); // very small max
    expect(result.status,).toBe("danger",);
  });
});

describe("countMessageTokens (B3: model-specific counting)", () => {
  it("honors an injected TokenCountFn instead of the default heuristic", () => {
    const messages = [msg("Hello world",), msg("This is a test",),];
    const modelSpecific = (text: string,) => text.length; // 1 token/char estimator
    // default heuristic → 3 + 4 = 7; custom → 11 + 14 = 25
    expect(countMessageTokens(messages,),).toBe(7,);
    expect(countMessageTokens(messages, modelSpecific,),).toBe(25,);
  });

  it("computeContextWindow threads TokenCountFn into currentTokens", () => {
    const messages = [msg("Hello world",),];
    const result = computeContextWindow(messages, 32_000, THRESHOLDS.critical, (text,) => text.length,);
    expect(result.currentTokens,).toBe(11,);
  });
});
