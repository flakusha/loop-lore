// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/index.ts — Autonomy module barrel
//
// Phase 1: config layer (resolver + presets).
// Phase 2: rate governor.
// Phase 4: world-tick scheduler.

export { AutonomyGovernor, LIMIT_CATALOG, } from "./governor";
export type {
  AutonomyScope,
  BudgetRow,
  GovernorLimit,
  GovernorLimitCatalog,
  GovernorLimitName,
  GovernorResult,
  TryConsumeOptions,
} from "./governor";
export { AutonomyScheduler, SimulationStore, } from "./scheduler";
export type { AutonomySchedulerOptions, } from "./scheduler";
export type {
  AutonomyDispatch,
  AutonomyDispatchContext,
  AutonomyDispatchResult,
  SimulationState,
  TickResult,
  TickSkipReason,
  WorldScheduleEntry,
  WorldTickOutcome,
  WorldTickResult,
} from "./scheduler";

// Dispatch targets — gameplay subsystems the composition root registers on a
// scheduler. Targets own their own gating; the scheduler only runs the list.
export { createGmBeatDispatch, } from "./dispatch/gm-beat-dispatch";
export type { GmBeatDispatchOptions, } from "./dispatch/gm-beat-dispatch";
export { BDI_DISPATCH_NAME, BDI_SKIP, createBdiDispatch, } from "./dispatch/bdi-dispatch";
export type { CreateBdiDispatchOptions, } from "./dispatch/bdi-dispatch";
export { createTravelDispatch, } from "./dispatch/travel-dispatch";
export type { TravelDispatchOptions, } from "./dispatch/travel-dispatch";
// Pure simulation, no LLM call — registers AFTER `travel`, whose party
// status it reads. See the module header for the no-governor-charge argument.
export { createDiscoveryTradeDispatch, DISCOVERY_SKIP, } from "./dispatch/discovery-trade-dispatch";
export type { DiscoveryTradeDispatchOptions, } from "./dispatch/discovery-trade-dispatch";
// The workflow DAG runs OTHER tasks, so it does not charge the autonomy
// budget itself — see the reasoning at the top of its module.
export { createWorkflowDagDispatch, } from "./dispatch/workflow-dag-dispatch";
export type {
  WorkflowDagDispatchHandle,
  WorkflowDagDispatchOptions,
} from "./dispatch/workflow-dag-dispatch";

export { deriveTickRng, hashSeed, mulberry32, } from "./rng";
export { getPreset, PRESETS, SHIPPED_PRESETS, UnboundedStressGatedError, } from "./config";
export { resolveAutonomyConfig, } from "./config";
export type {
  AutonomyConfig,
  AutonomyConfigOverride,
  PacingPresetName,
  PresetDefinition,
  ResolveAutonomyScope,
} from "./config";
