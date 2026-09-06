// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { ProviderInstanceConfig, } from "../../../config/schema";
import { OllamaNativeProvider, } from "./index";

/**
 * @param overrides config overrides
 */
function config(overrides?: Partial<ProviderInstanceConfig>,): ProviderInstanceConfig {
  return {
    name: "ollama-test",
    label: "Ollama Test",
    baseUrl: "http://localhost:11434",
    model: "llama3",
    timeout: 1000,
    retries: 1,
    allowUserApiKey: false,
    models: {},
    ...overrides,
  };
}

describe("OllamaNativeProvider construction", () => {
  test("builds with a native base URL and embedding capability", () => {
    const provider = new OllamaNativeProvider(config(),);
    expect(provider.capabilities.type,).toBe("ollama",);
    expect(provider.capabilities.label,).toBe("Ollama Native",);
    expect(provider.capabilities.embeddings,).toBe(true,);
    expect(provider.capabilities.streaming,).toBe(true,);
  });

  test("rejects a missing base URL without a default", () => {
    expect(() => new OllamaNativeProvider(config({ baseUrl: "", },),)).toThrow();
  });

  test("rejects an invalid base URL", () => {
    expect(() => new OllamaNativeProvider(config({ baseUrl: "::::", },),)).toThrow();
  });
});
