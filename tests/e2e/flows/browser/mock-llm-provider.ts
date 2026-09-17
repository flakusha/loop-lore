// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E mock LLM provider wiring.
 *
 * `createBrowserTest` calls `initializeProviders(loadConfig())` but never
 * registers the `MockLLMProvider` the way `createTestServer` does
 * (helpers/server.ts:362-373). Any browser flow that triggers generation
 * would otherwise hit the real network / API keys.
 *
 * This module:
 *   - Re-exports the shared `MockLLMProvider` so browser tests get the same
 *     deterministic canned responses as API-level tests.
 *   - Provides `useMockLlmProvider()` — a one-call setter that registers
 *     the mock, clears the openaiCompatible list, and forces
 *     `defaultProvider=mock-provider` / `defaultModels["mock-provider"]="mock-model"`.
 *   - Provides `installMockLlmProvider(config)` — opt-in variant for tests
 *     that want to mutate config before `createBrowserTest` is called.
 *
 * Canned responses: see `@/test-utils/mock-provider` (same instance used by
 * generation e2e). Default text is "Mock response."; tests that need
 * different output can swap via the existing `failOnCall`/`streamError`
 * setters on the returned instance.
 */

import type { Config, } from "@/config/schema";
import {
  getProvider,
  initializeProviders,
  registerProvider,
} from "@/generation";
import { MockLLMProvider, } from "@/test-utils/mock-provider";

export { MockLLMProvider, } from "@/test-utils/mock-provider";

/** Mock provider name registered with the generation registry. */
export const MOCK_PROVIDER_NAME = "mock-provider";

/** Model ID the mock advertises and `defaultModels` is forced to. */
export const MOCK_MODEL_ID = "mock-model";

/**
 * Mutate a config in-place so the next `initializeProviders` call wires the
 * mock as the default. Does NOT call `initializeProviders` itself — callers
 * run that after, exactly as `createBrowserTest` does.
 */
export function installMockLlmProvider(config: Config,): MockLLMProvider {
  const mock = new MockLLMProvider();
  registerProvider(MOCK_PROVIDER_NAME, mock,);
  config.generation.defaultProvider = MOCK_PROVIDER_NAME;
  config.generation.defaultModels[MOCK_PROVIDER_NAME] = MOCK_MODEL_ID;
  config.generation.providers.openaiCompatible = [];
  return (getProvider(MOCK_PROVIDER_NAME,) as MockLLMProvider) ?? mock;
}

/**
 * Convenience: register the mock, run `initializeProviders(config)`, return
 * the active mock instance. Mirrors what `createTestServer` does for API
 * tests so browser tests can opt-in identically.
 */
export function useMockLlmProvider(config: Config,): MockLLMProvider {
  const mock = installMockLlmProvider(config,);
  initializeProviders(config,);
  return mock;
}
