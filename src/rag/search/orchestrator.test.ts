// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import { CaptchaBlockedError, ProviderRateLimitedError, } from "./errors";
import { type SearchProvider, type SearchResult, searchWithFallback, } from "./orchestrator";
import { searchBreaker, trackSearchError, } from "./quarantine";

const hit = (provider: string,): SearchResult[] => [{ title: "t", url: "https://t.test", snippet: "s", provider, },];

function provider(name: string, behavior: () => Promise<SearchResult[]> | SearchResult[],): SearchProvider {
  return { name, search: async (_q: string, _n: number,) => behavior(), };
}

beforeEach(() => {
  for (const name of ["ddg-cap", "brave-ok", "rate-p", "ok-p", "dead-a", "dead-b",]) { searchBreaker.reset(name,); }
},);

describe("searchWithFallback", () => {
  test("fails captcha provider over to next without retry", async () => {
    let calls = 0;
    const ddg = provider("ddg-cap", () => {
      calls++;
      throw new CaptchaBlockedError("ddg-cap", 900_000,);
    },);
    const brave = provider("brave-ok", () => hit("brave-ok",),);
    const results = await searchWithFallback([ddg, brave,], "ai agents",);
    expect(results[0]?.provider,).toBe("brave-ok",);
    expect(calls,).toBe(1,);
    expect(searchBreaker.allowRequest("ddg-cap",),).toBe(false,);
  });

  test("rate-limited provider backs off then falls through", async () => {
    const limited = provider("rate-p", () => {
      throw new ProviderRateLimitedError("rate-p", 5_000,);
    },);
    const ok = provider("ok-p", () => hit("ok-p",),);
    const results = await searchWithFallback([limited, ok,], "q",);
    expect(results[0]?.provider,).toBe("ok-p",);
    expect(searchBreaker.allowRequest("rate-p",),).toBe(false,);
  });

  test("skips already-quarantined providers and aggregates when all fail", async () => {
    const a = provider("dead-a", () => {
      throw new CaptchaBlockedError("dead-a", 900_000,);
    },);
    const b = provider("dead-b", () => {
      throw new Error("boom",);
    },);
    const first = await searchWithFallback([a, b,], "q",).then(
      () => null,
      (error: Error,) => error,
    );
    expect(first?.message,).toContain("All search providers failed",);
    // Second run reports quarantine skips, not fresh calls.
    const second = await searchWithFallback([a, b,], "q",).then(
      () => null,
      (error: Error,) => error,
    );
    expect(second?.message,).toContain("quarantined",);
  });
  test("trackSearchError quarantines then rethrows", () => {
    expect(() => trackSearchError(new CaptchaBlockedError("trk-cap", 60_000,),)).toThrow("quarantined",);
    expect(searchBreaker.allowRequest("trk-cap",),).toBe(false,);
    expect(() => trackSearchError(new ProviderRateLimitedError("trk-rl", 1_000,),)).toThrow("rate limited",);
    expect(() => trackSearchError(new Error("plain",),)).toThrow("plain",);
  });
});
