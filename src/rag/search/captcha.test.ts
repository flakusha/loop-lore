// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test } from "bun:test";
import { isCaptchaResponse, parseRetryAfter } from "./captcha";
import { CaptchaBlockedError, ProviderRateLimitedError } from "./errors";

describe("isCaptchaResponse", () => {
  test("detects challenge body markers", () => {
    expect(isCaptchaResponse({ status: 200, body: "Please verify you are human" })).toBe(true);
    expect(isCaptchaResponse({ status: 200, body: "<div id='anomaly-modal'>" })).toBe(true);
  });

  test("detects challenge URLs", () => {
    expect(isCaptchaResponse({ status: 200, url: "https://x.test/sorry/index", body: "ok" })).toBe(true);
  });

  test("ignores 429 and clean pages", () => {
    expect(isCaptchaResponse({ status: 429, body: "rate limited" })).toBe(false);
    expect(isCaptchaResponse({ status: 200, body: "ten blue links here" })).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  test("parses seconds", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
  });

  test("caps at one hour and rejects garbage", () => {
    expect(parseRetryAfter("99999")).toBe(3_600_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });

  test("error taxonomy carries retry guidance", () => {
    expect(new CaptchaBlockedError("duckduckgo", 900_000).retryable).toBe(false);
    expect(new ProviderRateLimitedError("brave", 5_000).retryable).toBe(true);
  });
});
