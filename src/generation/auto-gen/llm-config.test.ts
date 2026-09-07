// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/auto-gen/llm-config.ts — whether any LLM
 * generation path is configured.
 *
 * The provider registry is process-global and shared with other test
 * files, so the registry-empty branch is asserted as a consistency check
 * rather than an unconditional false.
 */
import { describe, expect, it, } from "bun:test";
import type { Config, } from "../../config/schema";
import type { LLMProvider, } from "../providers/types";
import { listProviders, registerProvider, } from "../providers/registry";
import { isLlmGenerationConfigured, } from "./llm-config";

function makeConfig(overrides: {
  defaultProvider?: string;
  openaiCompatibleCount?: number;
},): Config {
  return {
    generation: {
      defaultProvider: overrides.defaultProvider ?? "",
      providers: {
        openaiCompatible: Array.from(
          { length: overrides.openaiCompatibleCount ?? 0, },
          (_v, i,) => ({
            name: `llm-config-fake-${i}`,
            label: `Fake ${i}`,
            baseUrl: "http://127.0.0.1:9",
            model: "m",
            timeout: 100,
            retries: 0,
            allowUserApiKey: false,
            models: {},
          }),
        ),
      },
      defaultModels: {},
    },
  } as unknown as Config;
}

describe("isLlmGenerationConfigured", () => {
  it("returns true when a default provider is set", () => {
    expect(isLlmGenerationConfigured(makeConfig({ defaultProvider: "main", },),),).toBe(true,);
  });

  it("returns true when openaiCompatible providers are configured", () => {
    expect(isLlmGenerationConfigured(makeConfig({ openaiCompatibleCount: 2, },),),).toBe(true,);
  });

  it("returns true when a provider is registered in the global registry", () => {
    registerProvider("llm-config-registered", {
      capabilities: {},
    } as unknown as LLMProvider,);
    expect(listProviders().some((p,) => p.name === "llm-config-registered",),).toBe(true,);
    expect(isLlmGenerationConfigured(makeConfig({},),),).toBe(true,);
  });

  it("ORs provider-name, configured instances, and the registry", () => {
    const empty = makeConfig({},);
    // The registry is process-global: whichever parts are populated must
    // flip the result, and an all-empty config can only be false when the
    // shared registry is also empty.
    expect(isLlmGenerationConfigured(empty,),).toBe(listProviders().length > 0,);
  });
});
