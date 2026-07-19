import { chatActions, } from "./chat-actions";
import { describe, expect, test, } from "bun:test";

describe("chatActions utility functions", () => {
  describe("formattedGenerationTime", () => {
    test("returns empty string for undefined", () => {
      expect(chatActions.formattedGenerationTime!(undefined,),).toBe("",);
    });

    test("returns empty string for null", () => {
      expect(chatActions.formattedGenerationTime!(null as any,),).toBe("",);
    });

    test("returns ms for values under 1000", () => {
      expect(chatActions.formattedGenerationTime!(0,),).toBe("",);
      expect(chatActions.formattedGenerationTime!(500,),).toBe("500ms",);
      expect(chatActions.formattedGenerationTime!(999,),).toBe("999ms",);
    });

    test("returns seconds for values under 60000", () => {
      expect(chatActions.formattedGenerationTime!(1000,),).toBe("1.0s",);
      expect(chatActions.formattedGenerationTime!(5000,),).toBe("5.0s",);
      expect(chatActions.formattedGenerationTime!(30_000,),).toBe("30.0s",);
      expect(chatActions.formattedGenerationTime!(59_999,),).toBe("60.0s",);
    });

    test("returns minutes for values 60000 and above", () => {
      expect(chatActions.formattedGenerationTime!(60_000,),).toBe("1.0m",);
      expect(chatActions.formattedGenerationTime!(120_000,),).toBe("2.0m",);
      expect(chatActions.formattedGenerationTime!(3_600_000,),).toBe("60.0m",);
    });
  });

  describe("formattedTokensPerSecond", () => {
    test("returns empty string for undefined message", () => {
      expect(chatActions.formattedTokensPerSecond!({},),).toBe("",);
    });

    test("returns empty string for message without metrics", () => {
      expect(chatActions.formattedTokensPerSecond!({},),).toBe("",);
    });

    test("uses tokens_per_second when available", () => {
      const result = chatActions.formattedTokensPerSecond!({ tokens_per_second: 42.5, },);
      expect(result,).toBe("42.5 t/s",);
    });

    test("calculates t/s from generation_time_ms and token_count_total", () => {
      const result = chatActions.formattedTokensPerSecond!({
        generation_time_ms: 1000,
        token_count_total: 100,
      },);
      expect(result,).toBe("100.0 t/s",);
    });

    test("returns empty string when calculation values missing", () => {
      const result = chatActions.formattedTokensPerSecond!({ generation_time_ms: 1000, },);
      expect(result,).toBe("",);
    });
  });

  describe("statsLine", () => {
    test("returns empty string for empty message", () => {
      expect(chatActions.statsLine!({},),).toBe("",);
    });

    test("includes model_id", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", },);
      expect(result,).toBe("gpt-4",);
    });

    test("includes provider", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", provider: "openai", },);
      expect(result,).toBe("gpt-4 · openai",);
    });

    test("includes formatted generation time", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", generation_time_ms: 5000, },);
      expect(result,).toContain("gpt-4",);
      expect(result,).toContain("5.0s",);
    });

    test("includes token count", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", token_count_total: 150, },);
      expect(result,).toContain("gpt-4",);
      expect(result,).toContain("150t",);
    });

    test("includes tokens per second", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", tokens_per_second: 30, },);
      expect(result,).toContain("gpt-4",);
      expect(result,).toContain("30.0 t/s",);
    });

    test("includes all fields when present", () => {
      const result = chatActions.statsLine!({
        model_id: "gpt-4",
        provider: "openai",
        generation_time_ms: 5000,
        token_count_total: 150,
        tokens_per_second: 30,
      },);
      expect(result,).toBe("gpt-4 · openai · 5.0s · 150t · 30.0 t/s",);
    });

    test("handles missing optional fields", () => {
      const result = chatActions.statsLine!({
        model_id: "gpt-4",
        token_count_total: 150,
      },);
      expect(result,).toBe("gpt-4 · 150t",);
    });
  });
});
