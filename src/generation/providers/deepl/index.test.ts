// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the DeepL provider construction. The provider hardcodes its
// base URL (api-free.deepl.com for the free tier, api.deepl.com for pro),
// so the shared SSRF validator normally rejects it — the url-validation
// module is mocked here so the tier routing and capabilities are covered.
//
// The dynamic import of "./index" is deliberate: the module mock must be
// registered before the provider module (and its base.ts import) is loaded.
import { afterAll, describe, expect, mock, test, } from "bun:test";
import type { DeepLProviderConfig, } from "../../../config/schema";
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
function config(overrides?: Partial<DeepLProviderConfig>,): DeepLProviderConfig {
  return {
    name: "deepl-test",
    label: "DeepL Test",
    authKey: "auth-key:fx",
    freeTier: true,
    model: "en-us",
    timeout: 1000,
    retries: 1,
    allowUserApiKey: false,
    ...overrides,
  };
}

describe("DeepLProvider construction", () => {
  test("free tier uses the api-free host and deepl capabilities", async () => {
    mode = "allow";
    try {
      const { DeepLProvider, } = await import("./index");
      class Probe extends DeepLProvider {
        /** @returns the resolved base URL */
        get baseUrl(): string {
          return this.state.baseUrl;
        }
      }
      const provider = new Probe(config(),);
      expect(provider.baseUrl,).toBe("https://api-free.deepl.com",);
      expect(provider.capabilities.type,).toBe("deepl",);
      expect(provider.capabilities.label,).toBe("DeepL",);
      expect(provider.capabilities.text,).toBe(true,);
      expect(provider.capabilities.streaming,).toBe(false,);
    } finally {
      mode = "real";
    }
  });

  test("pro tier uses the api host", async () => {
    mode = "allow";
    try {
      const { DeepLProvider, } = await import("./index");
      class Probe extends DeepLProvider {
        /** @returns the resolved base URL */
        get baseUrl(): string {
          return this.state.baseUrl;
        }
      }
      const provider = new Probe(config({ freeTier: false, },),);
      expect(provider.baseUrl,).toBe("https://api.deepl.com",);
    } finally {
      mode = "real";
    }
  });

  test("rejects a base URL that fails validation", async () => {
    mode = "reject";
    try {
      const { DeepLProvider, } = await import("./index");
      expect(() => new DeepLProvider(config(),)).toThrow(ProviderError,);
      expect(() => new DeepLProvider(config(),)).toThrow("not in allowlist",);
    } finally {
      mode = "real";
    }
  });

  test("the hardcoded remote host is rejected by the real SSRF validator", async () => {
    mode = "real";
    const { DeepLProvider, } = await import("./index");
    expect(() => new DeepLProvider(config(),)).toThrow(ProviderError,);
  });
});
