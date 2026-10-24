// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the LibreTranslate provider construction. Unlike the hardcoded
// remote-host providers, LibreTranslate takes its base URL from the operator's
// config, so a local instance builds as-is while a remote host is rejected by
// the shared SSRF validator.
import { describe, expect, test, } from "bun:test";
import type { LibreTranslateProviderConfig, } from "../../../config/schema";
import { ProviderError, } from "../types";
import { LibreTranslateProvider, } from "./index";

/**
 * @param overrides config overrides
 */
function config(overrides?: Partial<LibreTranslateProviderConfig>,): LibreTranslateProviderConfig {
  return {
    name: "libretranslate-test",
    label: "LibreTranslate Test",
    baseUrl: "http://localhost:5000",
    apiKey: undefined,
    model: "en",
    timeout: 1000,
    retries: 1,
    allowUserApiKey: false,
    ...overrides,
  };
}

/** Exposes the resolved state so the configured base URL can be asserted. */
class Probe extends LibreTranslateProvider {
  /** @returns the resolved base URL */
  get baseUrl(): string {
    return this.state.baseUrl;
  }
}

describe("LibreTranslateProvider construction", () => {
  test("builds with the configured base URL and libretranslate capabilities", () => {
    const provider = new Probe(config(),);
    expect(provider.baseUrl,).toBe("http://localhost:5000",);
    expect(provider.capabilities.type,).toBe("libretranslate",);
    expect(provider.capabilities.label,).toBe("LibreTranslate",);
    expect(provider.capabilities.text,).toBe(true,);
    expect(provider.capabilities.image,).toBe(false,);
    expect(provider.capabilities.embeddings,).toBe(false,);
    expect(provider.capabilities.streaming,).toBe(false,);
    expect(provider.capabilities.tools,).toBe(false,);
    expect(provider.capabilities.thinking,).toBe(false,);
  });

  test("keeps a non-default local base URL from the config", () => {
    const provider = new Probe(config({ baseUrl: "http://127.0.0.1:5001", },),);
    expect(provider.baseUrl,).toBe("http://127.0.0.1:5001",);
  });

  test("rejects a remote base URL under SSRF allowlist rules", () => {
    expect(
      () => new LibreTranslateProvider(config({ baseUrl: "https://libretranslate.example.com", },),),
    ).toThrow(ProviderError,);

    expect(
      () => new LibreTranslateProvider(config({ baseUrl: "https://libretranslate.example.com", },),),
    ).toThrow("not in allowlist",);
  });

  test("rejects an invalid base URL", () => {
    expect(() => new LibreTranslateProvider(config({ baseUrl: "::::", },),)).toThrow(ProviderError,);
  });
});
