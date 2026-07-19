import { describe, expect, test } from "bun:test";
import { formattedGenerationTime, formattedTokensPerSecond, statsLine } from "./chat-stats";

describe("formattedGenerationTime", () => {
  test("returns empty string for undefined", () => {
    expect(formattedGenerationTime()).toBe("");
  });

  test("returns empty string for 0", () => {
    expect(formattedGenerationTime(0)).toBe("");
  });

  test("formats milliseconds", () => {
    expect(formattedGenerationTime(500)).toBe("500ms");
  });

  test("formats seconds", () => {
    expect(formattedGenerationTime(1500)).toBe("1.5s");
  });

  test("formats minutes", () => {
    expect(formattedGenerationTime(125_000)).toBe("2.1m");
  });

  test("formats exact second boundary", () => {
    expect(formattedGenerationTime(1000)).toBe("1.0s");
  });
});

describe("formattedTokensPerSecond", () => {
  test("uses tokens_per_second when available", () => {
    expect(formattedTokensPerSecond({ tokens_per_second: 15.3 })).toBe("15.3 t/s");
  });

  test("calculates from generation_time_ms and token_count_total", () => {
    expect(formattedTokensPerSecond({ generation_time_ms: 2000, token_count_total: 100 })).toBe("50.0 t/s");
  });

  test("returns empty string when no data", () => {
    expect(formattedTokensPerSecond({})).toBe("");
  });

  test("returns empty string when only one metric present", () => {
    expect(formattedTokensPerSecond({ generation_time_ms: 1000 })).toBe("");
  });
});

describe("statsLine", () => {
  test("includes model_id", () => {
    expect(statsLine({ model_id: "gpt-4" })).toBe("gpt-4");
  });

  test("includes provider", () => {
    expect(statsLine({ provider: "openai" })).toBe("openai");
  });

  test("includes model and provider", () => {
    expect(statsLine({ model_id: "gpt-4", provider: "openai" })).toContain("gpt-4");
    expect(statsLine({ model_id: "gpt-4", provider: "openai" })).toContain("openai");
  });

  test("includes generation time", () => {
    expect(statsLine({ generation_time_ms: 2000 })).toContain("2.0s");
  });

  test("includes token count", () => {
    expect(statsLine({ token_count_total: 150 })).toContain("150t");
  });

  test("includes tokens per second", () => {
    expect(statsLine({ tokens_per_second: 12.5 })).toContain("12.5 t/s");
  });

  test("includes all fields", () => {
    const line = statsLine({
      model_id: "gpt-4",
      provider: "openai",
      generation_time_ms: 3000,
      token_count_total: 300,
      tokens_per_second: 100,
    });
    expect(line).toContain("gpt-4");
    expect(line).toContain("openai");
    expect(line).toContain("3.0s");
    expect(line).toContain("300t");
    expect(line).toContain("100.0 t/s");
  });

  test("returns empty string for empty input", () => {
    expect(statsLine({})).toBe("");
  });
});
