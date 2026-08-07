/**
 * Memory Injection — Probability-Based, Privacy-Aware Injection.
 *
 * Original module split into domain modules; this barrel preserves the
 * public import surface (`injection` / `injection/index`).
 */
export { shouldInjectMemory, } from "./decide";
export { toBasePrivacy, } from "./privacy";
export { selectMemoriesForInjection, } from "./select";
export {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  type InjectionContext,
  type InjectionPrivacyLevel,
  type MemoryComfort,
  type MemoryInjectionConfig,
  type MemoryInjectionEvent,
} from "./types";
