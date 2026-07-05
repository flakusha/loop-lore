/**
 * Mock LLM Provider for E2E tests.
 *
 * Re-exports shared MockLLMProvider from src/test-utils/mock-provider.ts.
 * Register with registerProvider() before running tests that need LLM.
 */

export { MockLLMProvider } from "@/test-utils/mock-provider";
