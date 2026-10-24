// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the Google Translate provider construction. The provider
// hardcodes its base URL (translation.googleapis.com), so the shared SSRF
// validator normally rejects it — the url-validation module is mocked here
// so the capabilities and the resolved host are covered.
//
// The dynamic import of "./index" is deliberate: the module mock must be
// registered before the provider module (and its base.ts import) is loaded.
import { afterAll, describe, expect, mock, test, } from "bun:test";
import type { GoogleTranslateProviderConfig, } from "../../../config/schema";
import * as urlValidation from "../../../utils/url-validation";
import { ProviderError, } from "../types";

const URL_VALIDATION_PATH = "../../../utils/url-validation";

const realExports = { ...urlValidation, };

type ValidationMode = "real" | "allow" | "reject";

let mode: ValidationMode = "real";

mock.module(URL_VALIDATION_PATH, () => {
  return {
    ...realExports,
    validateProviderUrl: (url: string,) => {
      if (mode === "allow") { return { ok: true, url, local: false, }; }
      if (mode === "reject") { return { ok: false, error: `Remote host "${url}" not in allowlist.`, }; }
      return realExports.validateProviderUrl(url,);
    },
  };
},);

// Restore the real module so sibling test files in the same process are
// unaffected by the mock.
afterAll(() => {
  mock.module(URL_VALIDATION_PATH, () => realExports,);
},);

/**
 * @param overrides config overrides
 */
function config(overrides?: Partial<GoogleTranslateProviderConfig>,): GoogleTranslateProviderConfig {
  return {
    name: "google-translate-test",
    label: "Google Translate Test",
    apiKey: "g-key",
    model: "en",
    timeout: 1000,
    retries: 1,
    allowUserApiKey: false,
    ...overrides,
  };
}

describe("GoogleTranslateProvider construction", () => {
  test("uses the Google Translate host and capabilities", async () => {
    mode = "allow";
    try {
      const { GoogleTranslateProvider, } = await import("./index");
      class Probe extends GoogleTranslateProvider {
        /** @returns the resolved base URL */
        get baseUrl(): string {
          return this.state.baseUrl;
        }
      }
      const provider = new Probe(config(),);
      expect(provider.baseUrl,).toBe("https://translation.googleapis.com",);
      expect(provider.capabilities.type,).toBe("google-translate",);
      expect(provider.capabilities.label,).toBe("Google Translate",);
      expect(provider.capabilities.text,).toBe(true,);
      expect(provider.capabilities.streaming,).toBe(false,);
    } finally {
      mode = "real";
    }
  });

  test("rejects a base URL that fails validation", async () => {
    mode = "reject";
    try {
      const { GoogleTranslateProvider, } = await import("./index");
      expect(() => new GoogleTranslateProvider(config(),)).toThrow(ProviderError,);
      expect(() => new GoogleTranslateProvider(config(),)).toThrow("not in allowlist",);
    } finally {
      mode = "real";
    }
  });

  test("the hardcoded remote host is rejected by the real SSRF validator", async () => {
    mode = "real";
    const { GoogleTranslateProvider, } = await import("./index");
    expect(() => new GoogleTranslateProvider(config(),)).toThrow(ProviderError,);
  });
});
