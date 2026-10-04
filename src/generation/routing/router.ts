// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model router — order candidates for one request by explicit task signal.
 *
 * `route()` is pure — no network, no clock, no randomness — apart from the
 * `round-robin` cursor, which is the only state it touches. Every other
 * strategy yields the same order for the same input, so a route is
 * reproducible and testable. Metadata gaps (no cost, no latency) are
 * "unknown", never an error — an unannotated model still serves, it just
 * sorts last among equals.
 *
 * `capability-match` is the default because it is a no-op for candidates that
 * carry no cost/latency annotations: with nothing to score, every candidate
 * keeps its input order, which is the pre-routing behaviour.
 */
import type { GenerationRoutingConfig, ModelRoutingStrategy, } from "./routing-config";
import type { TaskCapability, TaskSignal, } from "./task-signal";

/** A routable model. Deliberately local to the router — no DB type leaks in. */
export interface RoutableModel {
  /** Provider instance name (registry key). */
  name: string;
  /** Model id within the provider. */
  model: string;
  /** Which provider capabilities the model exposes. */
  capabilities: Partial<Record<TaskCapability, boolean>>;
  /** USD per 1k tokens. Absent = unknown. */
  costPer1kTokens?: number;
  /** Mean latency in ms. Absent = unknown. */
  avgLatencyMs?: number;
  /** Total context window in tokens. Absent = unknown. */
  contextWindow?: number;
  /** Max tokens the model can emit. Absent = unknown. */
  maxOutputTokens?: number;
}

/** Ordered route: first attempt, then the fallback chain. */
export interface RouteResult<T extends RoutableModel = RoutableModel,> {
  primary: T | null;
  fallbacks: T[];
}

/** Strategies, in declaration order. `capability-match` is the no-op default. */
export const ROUTING_STRATEGIES: ModelRoutingStrategy[] = [
  "capability-match",
  "cheapest",
  "fastest",
  "round-robin",
];

/**
 * Rank candidates for one signal. `rrOffset` is a per-instance counter used
 * only by `round-robin`; every other strategy ignores it, so routing stays
 * deterministic for a fixed counter value.
 */
export class ModelRouter {
  private rrOffset = 0;

  /**
   * @param config - `config.generation.routing`; absent = capability-match with no rules.
   */
  constructor(private readonly config?: GenerationRoutingConfig,) {}

  /**
   * Order candidates for a signal: `{ primary, fallbacks }`. Never throws —
   * an empty candidate set yields a null primary.
   * @param signal - classified work; a null signal means "no policy, keep input order".
   * @param candidates - models eligible to serve it, most-preferred first.
   * @returns Ordered primary + fallbacks.
   */
  route<T extends RoutableModel,>(signal: TaskSignal | null, candidates: T[],): RouteResult<T> {
    if (!signal || candidates.length === 0) {
      return { primary: candidates[0] ?? null, fallbacks: candidates.slice(1,), };
    }

    // Fail-open: only an explicit `false` disqualifies a candidate. An
    // unannotated provider still serves, because dropping it would leave a
    // model-less caller with no route at all.
    const eligible = candidates.filter((c,) => {
      for (const capability of signal.requiresCapabilities ?? []) {
        if (c.capabilities[capability] === false) { return false; }
      }

      return signal.estimatedTokens === undefined || c.contextWindow === undefined ||
        signal.estimatedTokens <= c.contextWindow;
    },);

    if (eligible.length === 0) { return { primary: null, fallbacks: [], }; }

    const rule = this.config?.rules?.find((r,) => r.taskType === signal.taskType);
    const strategy = rule?.strategy ?? this.config?.strategy ?? "capability-match";
    let ordered: T[];
    if (strategy === "round-robin") {
      const offset = this.rrOffset % eligible.length;
      // The cursor is the only state `route()` touches, so it advances here
      // and nowhere else: every other strategy must leave it alone.
      this.rrOffset++;
      ordered = eligible.slice(offset,).concat(eligible.slice(0, offset,),);
    } else {
      ordered = eligible
        .map((model, index,) => ({
          model,
          index,
          // Unknown metadata sorts last among equals.
          score: strategy === "cheapest"
            ? model.costPer1kTokens ?? Number.POSITIVE_INFINITY
            : strategy === "fastest"
            ? model.avgLatencyMs ?? Number.POSITIVE_INFINITY
            : 0,
        }))
        .sort((a, b,) => a.score - b.score || a.index - b.index)
        .map((entry,) => entry.model);
    }

    const primary = ordered[0] ?? null;
    const rest = ordered.slice(1,);
    const cap = this.config?.fallbacks;
    return { primary, fallbacks: cap === undefined ? rest : rest.slice(0, cap,), };
  }
}

// True when the policy can change an order. The default — `capability-match`
// with no rules and no fallback cap — is the pre-routing behaviour, so running
// it would only add the eligibility filter (dropping a fallback that declares a
// required capability `false`) to every dispatch. Routing was never asked to
// change which providers are eligible.
export function routingReorders(config?: GenerationRoutingConfig,): boolean {
  if (config === undefined) { return false; }
  return config.strategy !== "capability-match" ||
    (config.rules?.length ?? 0) > 0 || config.fallbacks !== undefined;
}

// The router every production dispatch shares, keyed on the routing config it
// was built from. A router per call would reset its round-robin cursor to 0 on
// every dispatch, so `round-robin` would only ever rotate in a test that reuses
// one instance. The key is the config object itself: a config reload yields a new
// one, which rebuilds the router (restarting the rotation) instead of routing
// against a policy that is no longer configured.
let shared: { routing: GenerationRoutingConfig | undefined; router: ModelRouter } | undefined;

export function sharedRouter(routing?: GenerationRoutingConfig,): ModelRouter {
  if (shared === undefined || shared.routing !== routing) {
    shared = { routing, router: new ModelRouter(routing,), };
  }

  return shared.router;
}
