// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { validateProviderUrl, validateProviderUrls } from "./url-validation.ts";

describe("url-validation", () => {
  test("allows localhost", () => {
    expect(validateProviderUrl("http://localhost:8080/").ok).toBe(true);
  });
  test("blocks invalid URL", () => {
    expect(validateProviderUrl("not-a-url").ok).toBe(false);
  });
  test("checks allowlist", () => {
    const res = validateProviderUrl("http://api.openai.com/", { allowlist: ["api.openai.com"] });
    expect(res.ok).toBe(true);
  });
  test("batch validates entries", () => {
    const results = validateProviderUrls([{ name: "local", url: "http://127.0.0.1" }]);
    expect(results.local?.ok).toBe(true);
  });
});