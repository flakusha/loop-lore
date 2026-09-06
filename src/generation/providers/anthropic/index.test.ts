// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { ProviderInstanceConfig, } from "../../../config/schema";
import { AnthropicProvider, } from "./index";

/**
 * @param overrides config overrides
 */
function config(overrides?: Partial<ProviderInstanceConfig>,): ProviderInstanceConfig {
  return {
    name: "anthropic-test",
    label: "Anthropic Test",
    baseUrl: "",
    model: "claude-test",
    timeout: 1000,
    retries: 1,
    allowUserApiKey: false,
    models: {},
    ...overrides,
  };
}

describe("AnthropicProvider construction", () => {
  test("builds with a local base URL and anthropic capabilities", () => {
    const provider = new AnthropicProvider(config({ baseUrl: "http://localhost:8080", },),);
    expect(provider.capabilities.type,).toBe("anthropic",);
    expect(provider.capabilities.label,).toBe("Anthropic",);
    expect(provider.capabilities.text,).toBe(true,);
    expect(provider.capabilities.image,).toBe(true,);
    expect(provider.capabilities.streaming,).toBe(true,);
    expect(provider.capabilities.thinking,).toBe(true,);
  });

  test("rejects the default remote base URL under SSRF allowlist rules", () => {
    // Empty baseUrl falls back to https://api.anthropic.com, which the
    // SSRF validator rejects without an allowlist entry (suspected source
    // bug — reported to the main agent).
    expect(() => new AnthropicProvider(config(),)).toThrow();
  });

  test("rejects an invalid base URL", () => {
    expect(() => new AnthropicProvider(config({ baseUrl: "::::", },),)).toThrow();
  });
});
