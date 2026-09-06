// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { ProviderInstanceConfig, } from "../../../config/schema";
import { OpenAiCompatibleProvider, } from "./index";

/**
 * @param overrides config overrides
 */
function config(overrides?: Partial<ProviderInstanceConfig>,): ProviderInstanceConfig {
  return {
    name: "compat-test",
    label: "Compat Test",
    baseUrl: "http://localhost:8080/v1",
    model: "test-model",
    timeout: 1000,
    retries: 1,
    allowUserApiKey: true,
    models: {},
    ...overrides,
  };
}

describe("OpenAiCompatibleProvider construction", () => {
  test("builds with capabilities for the OpenAI-compatible family", () => {
    const provider = new OpenAiCompatibleProvider(config(),);
    expect(provider.capabilities.type,).toBe("openai-compatible",);
    expect(provider.capabilities.label,).toBe("OpenAI Compatible",);
    expect(provider.capabilities.tools,).toBe(true,);
    expect(provider.capabilities.thinking,).toBe(true,);
  });

  test("rejects a missing base URL without a default", () => {
    expect(() => new OpenAiCompatibleProvider(config({ baseUrl: "", },),)).toThrow();
  });

  test("rejects an invalid base URL", () => {
    expect(() => new OpenAiCompatibleProvider(config({ baseUrl: "::::", },),)).toThrow();
  });
});
