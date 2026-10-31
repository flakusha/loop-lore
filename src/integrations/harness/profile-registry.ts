// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ProfileRegistry — static `harness.acp.profiles[]` config + one-shot lazy
 * probe. Per profile it owns one adapter connection (created through the
 * injected {@link HarnessAdapterFactory}, so tests substitute a fake and
 * production gets the omp adapter) and probes it once: `enumerateModels()`
 * validates every tier's configured model id against the harness's
 * advertised list. Drift degrades the tier (warning, never a throw); a
 * failed probe marks the whole profile unhealthy.
 */

import type { AcpProfileConfig, } from "../../config/schema/harness";
import {
  HARNESS_DEFAULT_COOLDOWN_MS,
  HARNESS_DEFAULT_MAX_CONSECUTIVE_FAILURES,
} from "../../config/sections/harness";
import { getChildLogger, } from "../../logger";
import {
  type HarnessAcpAdapter,
  type HarnessAdapterFactory,
} from "./adapter-types";
import type { HealthThresholds, } from "./profile-breaker";

/** Logger; null-safe — the harness must work before logger init. */
const log = (): ReturnType<typeof getChildLogger> => getChildLogger("harness-acp",);

/** Probe lifecycle per profile. */
type ProbeState = "unprobed" | "healthy" | "unhealthy";

/** A tier that survived (or was degraded by) the probe. */
export interface ProbedTier {
  tier: "good" | "fast";
  /** Configured model id (kept even when degraded, for error messages). */
  model: string;
  /** false when the configured id was absent from the advertised list. */
  advertised: boolean;
}

/** Result of probing one profile. */
export interface ProbeResult {
  profile: string;
  state: ProbeState;
  tiers: ProbedTier[];
  /** Error detail when state is `unhealthy`. */
  error?: string;
}

/** Registry options. */
export interface ProfileRegistryOptions {
  /** The `harness.acp` sub-config. */
  acp: { enabled: boolean; profiles: AcpProfileConfig[] };
  /** Adapter factory (omp in production, fake in tests). */
  factory: HarnessAdapterFactory;
}

/** */
export class ProfileRegistry {
  private readonly profiles: AcpProfileConfig[];
  private readonly factory: HarnessAdapterFactory;
  private readonly connections = new Map<string, HarnessAcpAdapter>();
  private readonly probed = new Map<string, ProbeResult>();
  private readonly pending = new Map<string, Promise<ProbeResult>>();

  /**
   * @param options - config + adapter factory
   */
  constructor(options: ProfileRegistryOptions,) {
    this.profiles = options.acp.profiles;
    this.factory = options.factory;
  }

  /**
   * Configured profile by name (regardless of probe state).
   * @param name - profile name
   */
  config(name: string,): AcpProfileConfig | undefined {
    return this.profiles.find((p,) => p.name === name);
  }

  /** All configured profile names, in preference order. */
  names(): string[] {
    return this.profiles.map((p,) => p.name);
  }

  /**
   * Breaker thresholds for a profile (config `health` or defaults).
   * @param name - profile name
   * @returns resolved thresholds.
   */
  healthThresholds(name: string,): HealthThresholds {
    const cfg = this.config(name,)?.health;
    return {
      maxConsecutiveFailures: cfg?.maxConsecutiveFailures ?? HARNESS_DEFAULT_MAX_CONSECUTIVE_FAILURES,
      cooldownMs: cfg?.cooldownMs ?? HARNESS_DEFAULT_COOLDOWN_MS,
    };
  }

  /**
   * Probe a profile once (lazy, memoized): connect, enumerate advertised
   * models, validate tier ids. Concurrent callers share one probe.
   * @param name - profile name
   * @returns the probe result; never throws.
   */
  ensureProbed(name: string,): Promise<ProbeResult> {
    const cached = this.probed.get(name,);
    if (cached) { return Promise.resolve(cached,); }
    const inFlight = this.pending.get(name,);
    if (inFlight) { return inFlight; }
    const promise = this.probe(name,).finally(() => {
      this.pending.delete(name,);
    },);

    this.pending.set(name, promise,);
    return promise;
  }

  /**
   * The live adapter for a probed profile.
   * @param name - profile name
   * @returns the adapter, or undefined when unprobed/unhealthy.
   */
  connection(name: string,): HarnessAcpAdapter | undefined {
    return this.connections.get(name,);
  }

  /**
   * Run the actual probe for one profile.
   * @param name - profile name
   * @returns memoized probe result.
   */
  private async probe(name: string,): Promise<ProbeResult> {
    const cfg = this.config(name,);
    if (!cfg) {
      return this.memoize({ profile: name, state: "unhealthy", tiers: [], error: "unknown profile", },);
    }

    try {
      const adapter = await this.factory(name, cfg.command,);
      const advertised = new Set(await adapter.enumerateModels(),);
      const tiers: ProbedTier[] = (Object.keys(cfg.tiers,) as Array<"good" | "fast">).map((tier,) => {
        const model = cfg.tiers[tier]?.model ?? "";
        const advertisedOk = advertised.has(model,);
        if (!advertisedOk) {
          log()?.warn(
            "harness profile tier model not advertised — tier degraded",
            { profile: name, tier, model, },
          );
        }

        return { tier, model, advertised: advertisedOk, };
      },);

      this.connections.set(name, adapter,);
      return this.memoize({ profile: name, state: "healthy", tiers, },);
    } catch (error) {
      log()?.warn("harness profile probe failed — marked unhealthy", {
        profile: name,
        error: (error as Error).message,
      },);

      return this.memoize({ profile: name, state: "unhealthy", tiers: [], error: (error as Error).message, },);
    }
  }

  /**
   * Cache a probe result.
   * @param result - the finished probe
   * @returns the same result, for tail-call ergonomics.
   */
  private memoize(result: ProbeResult,): ProbeResult {
    this.probed.set(result.profile, result,);
    return result;
  }
}
