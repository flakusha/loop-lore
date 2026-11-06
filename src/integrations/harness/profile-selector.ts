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
 * Candidate admission also carries the ToS acknowledgement guard
 * (TASK-harness-tos-acknowledgement-dispatch-guard, scoped by
 * BUG-tos-dispatch-guard-denies-local-api-profiles-that-the-bindin): only
 * subscription-backed flavors (`providerTosGated`) require
 * `tosGrayzoneAcknowledged: true`; local/api profiles stay ungated. The
 * ack and the master switch are read from the EFFECTIVE admin-settings
 * view (UI toggles), falling back to the file config while the store is
 * unseeded; a gated profile without an acknowledgement is denied with the
 * `tos_unacknowledged` skip code.
 *
 * Only the `failover` strategy exists in this slice: `runTurn` walks the
 * ordered candidates and rotates to the next (profile, tier) on failure.
 */

import { type AcpProfileConfig, type HarnessCapability, type HarnessTierId, } from "../../config/schema/harness";
import { getChildLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import {
  HarnessAcpError,
  type HarnessAdapterFactory,
  type HarnessTurnResult,
} from "./adapter-types";
import {
  getHarnessAdminSettings,
  type HarnessAdminSettingsView,
  isHarnessAdminSettingsSeeded,
} from "./admin-settings";
import { ProfileBreaker, } from "./profile-breaker";
import { type ProfileRegistry, } from "./profile-registry";
import { providerTosGated, } from "./provider-tos";
import { type UsageLedger, } from "./usage-ledger";

/** Logger; null-safe — the selector must work before logger init. */
const log = (): ReturnType<typeof getChildLogger> => getChildLogger("harness-acp",);

/** Skip code for a profile denied because its ToS greyzone acknowledgement is absent. */
export type HarnessDispatchSkipCode = "tos_unacknowledged";

/** The ToS acknowledgement skip code (stable, surfaced in zero-candidate errors). */
export const HARNESS_TOS_UNACKNOWLEDGED: HarnessDispatchSkipCode = "tos_unacknowledged";

/** One profile excluded from candidate admission, with the machine-readable why. */
export interface DispatchSkip {
  /** Denied profile name. */
  profile: string;
  /** Machine-readable denial reason (distinct from capability/limit/breaker skips). */
  code: HarnessDispatchSkipCode;
}

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
  /**
   * Restrict admission to this one profile. The isolation gate allows a
   * dispatch only against an admin-configured profile, so a gated caller pins
   * the profile it was cleared for instead of letting the failover walk run
   * the turn on a different one.
   */
  profile?: string;
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
    return (await this.walk(requirement,)).candidates;
  }

  /**
   * Walk every configured profile and split admission into survivors and
   * ToS denials, so `runTurn` can attribute an empty candidate list to its
   * cause.
   * @param requirement - what the turn needs
   * @returns ordered candidates plus the ToS acknowledgement denials.
   */
  private async walk(
    requirement: TurnRequirement,
  ): Promise<{ candidates: TurnCandidate[]; skips: DispatchSkip[] }> {
    const wantedTier = requirement.preferredTier ??
      (GOOD_TIER_TASK_TYPES.has(requirement.taskType,) ? "good" : "fast");

    // Master switch: the effective admin-settings view (UI toggle) once the
    // store is seeded; the raw file layer while unseeded. Off = no probing,
    // no candidates, no spawns (BUG-admin-settings-overrides-never-reach-
    // the-harness-dispatch-gu, AC "disabled override suppresses spawn even
    // with file enabled: true").
    const effective = isHarnessAdminSettingsSeeded() ? getHarnessAdminSettings() : null;
    if (effective && !effective.enabled) {
      return { candidates: [], skips: [], };
    }

    const candidates: TurnCandidate[] = [];
    const skips: DispatchSkip[] = [];
    for (const name of this.pinnedTo(requirement,)) {
      const probe = await this.registry.ensureProbed(name,);
      if (probe.state !== "healthy") { continue; }
      const cfg = this.registry.config(name,);
      if (!cfg) { continue; }
      // Scope + ack: only subscription-backed flavors are gated; local/api
      // profiles stay ungated; an unknown flavor is fail-closed GATED
      // (BUG-tos-dispatch-guard-denies-local-api-profiles-that-the-bindin).
      if (this.tosDenied(cfg, effective,)) {
        skips.push({ profile: name, code: HARNESS_TOS_UNACKNOWLEDGED, },);
        log()?.warn(
          "harness profile denied — ToS greyzone not acknowledged",
          { profile: name, code: HARNESS_TOS_UNACKNOWLEDGED, },
        );

        continue;
      }

      const tier = cfg.tiers[wantedTier];
      const probedTier = probe.tiers.find((t,) => t.tier === wantedTier);
      if (!tier || !probedTier?.advertised) { continue; }
      if (!this.covers(tier.capabilities, requirement.needsCapabilities,)) { continue; }
      const verdict = this.ledger.check(name, cfg.limits,);
      if (!verdict.allowed) { continue; }
      if (!this.breaker.allow(name,)) { continue; }
      candidates.push({ profile: name, tier: wantedTier, model: tier.model, },);
    }

    candidates.sort((a, b,) => (this.costs.get(a.model,) ?? Infinity) - (this.costs.get(b.model,) ?? Infinity));
    return { candidates, skips, };
  }

  /**
   * The profiles this requirement may run on: the pinned one (the isolation
   * gate's allowlist) or every configured profile.
   * @param requirement - what the turn needs
   * @returns the profile names to consider.
   */
  private pinnedTo(requirement: TurnRequirement,): string[] {
    const names = this.registry.names();
    return requirement.profile === undefined
      ? names
      : names.filter((name,) => name === requirement.profile);
  }

  /**
   * Whether admission for this profile requires a ToS greyzone
   * acknowledgement and none is in force. Acknowledgement source: the
   * effective admin-settings view (override acks win); a profile absent
   * from the seeded view falls back to its file flag — last-known-good,
   * never an implicit true (no-downgrade AC).
   * @param cfg - the profile's file config
   * @param effective - the effective admin-settings view, or null while the
   *   store is unseeded (file-config fallback)
   * @returns true when the profile must be denied with `tos_unacknowledged`.
   */
  private tosDenied(cfg: AcpProfileConfig, effective: HarnessAdminSettingsView | null,): boolean {
    const viewProfile = effective?.profiles.find((p,) => p.name === cfg.name);
    const acknowledged = viewProfile?.tosGrayzoneAcknowledged ?? cfg.tosGrayzoneAcknowledged === true;
    return providerTosGated(cfg.harness,) && !acknowledged;
  }

  /**
   * Run one turn with failover: walk the ordered candidates; on failure
   * record it with the breaker and rotate to the next candidate.
   * @param requirement - what the turn needs
   * @param prompt - the prompt text
   * @param factory - adapter factory for candidates not yet connected
   * @returns the attributed turn result.
   * @throws {HarnessAcpError} kind `prompt` when every candidate failed; the
   * message names `tos_unacknowledged` when ToS denial emptied the list.
   */
  async runTurn(
    requirement: TurnRequirement,
    prompt: string,
    factory: HarnessAdapterFactory,
  ): Promise<AttributedTurn> {
    const { candidates, skips, } = await this.walk(requirement,);
    if (candidates.length === 0) {
      const shown = safeJsonStringify(requirement,);
      const tosNote = skips.length > 0
        ? ` [${skips.map((s,) => `${s.code}:${s.profile}`).join(", ",)}]`
        : "";

      throw new HarnessAcpError(
        "prompt",
        `no harness profile satisfies ${shown.ok ? shown.value : "?"}${tosNote}`,
      );
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
