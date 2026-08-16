// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory system — public API.
 *
 * Re-exports all memory services: extraction, budget, purge, provision, shareability, injection.
 */
export { estimateTokens, } from "../chat/token-utils";
export { getMemoriesWithinBudget, selectWithinBudget, } from "./budget";
export { extractAndStoreMemories, extractMemories, storeMemories, } from "./extraction";
export {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  selectMemoriesForInjection,
  shouldInjectMemory,
  toBasePrivacy,
} from "./injection";
export type {
  InjectionContext,
  InjectionPrivacyLevel,
  MemoryComfort,
  MemoryInjectionConfig,
  MemoryInjectionEvent,
} from "./injection";
export { provisionMemories, } from "./provision";
export type { ProvisionContext, ProvisionResult, } from "./provision";
export { applyDecay, purgeStaleMemories, touchMemory, } from "./purge";
export { evaluateShareability, isMemoryVisible, parseShareability, } from "./shareability";
export type { ShareabilityConfig, } from "./shareability";
export type {
  ExtractedMemory,
  ExtractionOpts,
  InjectionPrivacyLevel as InjectionPrivacyLevelType,
  MemoryBudgetConfig,
  MemoryEntry,
  MemoryPrivacy,
  MemoryScope,
  MemorySelectionOpts,
  PurgeConfig,
} from "./types";
