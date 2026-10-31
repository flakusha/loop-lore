// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ProfileSelector — ordered candidate selection over probed profiles.
 *
 * Rules, in order (spec §2.3):
 *   1. capability match — tier capabilities ⊇ task requirement
 *   2. limit budget — instance-owned UsageLedger (rpm / tokensPerDay / quota)
 *   3. health — instance-owned ProfileBreaker skips open profiles
 *   4. cost — cheapest `costPer1kTokens` first among the survivors
 *
 * Only the `failover` strategy exists in this slice: `runTurn` walks the
 * ordered candidates and rotates to the next (profile, tier) on failure.
 */

import type { HarnessCapability, HarnessTierId, } from "../../config/schema/harness";
import { safeJsonStringify, } from "../../utils";
import {
  HarnessAcpError,
  type HarnessAdapterFactory,
  type HarnessTurnResult,
} from "./adapter-types";
import { ProfileBreaker, } from "./profile-breaker";
import { type ProfileRegistry, } from "./profile-registry";
import { type UsageLedger, } from "./usage-ledger";

/** Task types that default to the `good` tier; everything else goes `fast`. */
const GOOD_TIER_TASK_TYPES = new Set(["planning", "design", "review",],);

/** What the caller asks for. */
export interface TurnRequirement {
  /** Task type; defaults the tier when no explicit tier is given. */
  taskType: string;
  /** Capabilities the tier must cover. */
  needsCapabilities: HarnessCapability[];
  /** Explicit tier preference (overrides the taskType default). */
  preferredTier?: HarnessTierId;
}

/** One selectable (profile, tier) candidate. */
export interface TurnCandidate {
  profile: string;
  tier: HarnessTierId;
  model: string;
}

/** A finished, attributed turn. */
export interface AttributedTurn {
  result: HarnessTurnResult;
  profile: string;
  tier: HarnessTierId;
  model: string;
}

/** Selector collaborators, all instance-owned (no module singletons). */
export interface ProfileSelectorDeps {
  registry: ProfileRegistry;
  ledger: UsageLedger;
  breaker: ProfileBreaker;
}

/** Optional per-candidate cost metadata, resolved by the caller. */
export interface ProfileSelectorOptions {
  /** Cost per 1k tokens per model id, for the cost tiebreak (USD). */
  costPer1kTokens?: Map<string, number>;
}

/** */
export class ProfileSelector {
  private readonly registry: ProfileRegistry;
  private readonly ledger: UsageLedger;
  private readonly breaker: ProfileBreaker;
  private readonly costs: Map<string, number>;

  /**
   * @param deps - registry + ledger + breaker (all injected)
   * @param options - optional cost table for the tiebreak
   */
  constructor(deps: ProfileSelectorDeps, options: ProfileSelectorOptions = {},) {
    this.registry = deps.registry;
    this.ledger = deps.ledger;
    this.breaker = deps.breaker;
    this.costs = options.costPer1kTokens ?? new Map();
  }

  /**
   * Probe every configured profile and return the ordered candidate list:
   * capability match → limit budget → open breaker → cost tiebreak.
   * @param requirement - what the turn needs
   * @returns ordered candidates (possibly empty).
   */
  async select(requirement: TurnRequirement,): Promise<TurnCandidate[]> {
    const wantedTier = requirement.preferredTier ??
      (GOOD_TIER_TASK_TYPES.has(requirement.taskType,) ? "good" : "fast");

    const candidates: TurnCandidate[] = [];
    for (const name of this.registry.names()) {
      const probe = await this.registry.ensureProbed(name,);
      if (probe.state !== "healthy") { continue; }
      const cfg = this.registry.config(name,);
      if (!cfg) { continue; }
      const tier = cfg.tiers[wantedTier];
      const probedTier = probe.tiers.find((t,) => t.tier === wantedTier);
      if (!tier || !probedTier?.advertised) { continue; }
      if (!this.covers(tier.capabilities, requirement.needsCapabilities,)) { continue; }
      const verdict = this.ledger.check(name, cfg.limits,);
      if (!verdict.allowed) { continue; }
      if (!this.breaker.allow(name,)) { continue; }
      candidates.push({ profile: name, tier: wantedTier, model: tier.model, },);
    }

    return candidates.sort((a, b,) => (this.costs.get(a.model,) ?? Infinity) - (this.costs.get(b.model,) ?? Infinity));
  }

  /**
   * Run one turn with failover: walk the ordered candidates; on failure
   * record it with the breaker and rotate to the next candidate.
   * @param requirement - what the turn needs
   * @param prompt - the prompt text
   * @param factory - adapter factory for candidates not yet connected
   * @returns the attributed turn result.
   * @throws {HarnessAcpError} kind `prompt` when every candidate failed.
   */
  async runTurn(
    requirement: TurnRequirement,
    prompt: string,
    factory: HarnessAdapterFactory,
  ): Promise<AttributedTurn> {
    const candidates = await this.select(requirement,);
    if (candidates.length === 0) {
      const shown = safeJsonStringify(requirement,);
      throw new HarnessAcpError("prompt", `no harness profile satisfies ${shown.ok ? shown.value : "?"}`,);
    }

    let lastError: HarnessAcpError | null = null;
    for (const candidate of candidates) {
      let adapter = this.registry.connection(candidate.profile,);
      try {
        adapter ??= await factory(candidate.profile, this.registry.config(candidate.profile,)?.command ?? [],);
        await adapter.setModel(candidate.model,);
        const result = await adapter.prompt(prompt,);
        this.breaker.onSuccess(candidate.profile,);
        this.ledger.record(candidate.profile, result.usage?.totalTokens ?? 0,);
        return { result, profile: candidate.profile, tier: candidate.tier, model: candidate.model, };
      } catch (error) {
        lastError = error instanceof HarnessAcpError
          ? error
          : new HarnessAcpError("prompt", (error as Error).message, { cause: error, },);

        this.breaker.onFailure(candidate.profile,);
      }
    }

    throw lastError ?? new HarnessAcpError("prompt", "all harness candidates failed",);
  }

  /**
   * Whether the tier's capabilities cover the requirement.
   * @param have - tier capabilities
   * @param need - required capabilities
   * @returns true when every required capability is present.
   */
  private covers(have: HarnessCapability[] | undefined, need: HarnessCapability[],): boolean {
    return need.every((c,) => have?.includes(c,) ?? false);
  }
}
