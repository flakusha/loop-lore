// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Routing policy config. Split out of `src/config/schema/generation.ts` so the
 * router imports the shape without pulling the config barrel (which imports
 * the router's consumers). The section re-exports these types unchanged, so
 * `config.generation.routing` has exactly one definition.
 */

/** Ordering strategies the router implements. */
export type ModelRoutingStrategy = "capability-match" | "cheapest" | "fastest" | "round-robin";

/** One per-task-type override. A rule with no match never applies. */
export interface RoutingRule {
  /** `TaskType` this rule targets. */
  taskType: string;
  /** Strategy to use for matching signals. */
  strategy: ModelRoutingStrategy;
}

/** `config.generation.routing`. */
export interface GenerationRoutingConfig {
  /** Ordering strategy. Default `capability-match` (a no-op for unannotated models). */
  strategy: ModelRoutingStrategy;
  /** Hard cap on the fallback chain; entries past it are dropped. */
  fallbacks?: number;
  /** Per-task-type strategy overrides. */
  rules?: RoutingRule[];
}
