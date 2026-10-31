// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-profile circuit breaker for external harness profiles (instance-owned;
 * mirrors the semantics of `src/generation/providers/call-with-failover.ts`
 * but is constructed per registry, never a module singleton — parallel test
 * suites must not share breaker state).
 *
 * States per profile: closed → open (N consecutive failures) → closed again
 * after `cooldownMs`. Thresholds come from the profile's `health` config;
 * defaults in `src/config/sections/harness.ts`.
 */

/** Injected clock so tests drive cooldowns without sleeps. */
export type HealthClock = () => number;

/** Real time, the production clock. */
export const realHealthClock: HealthClock = () => Date.now();

/** Breaker thresholds for one profile. */
export interface HealthThresholds {
  /** Consecutive failures before the breaker opens. */
  maxConsecutiveFailures: number;
  /** How long an open breaker blocks the profile (ms). */
  cooldownMs: number;
}

/** Internal per-profile state. */
interface ProfileHealth {
  consecutiveFailures: number;
  openUntil: number;
}

/** */
export class ProfileBreaker {
  private readonly profiles = new Map<string, ProfileHealth>();
  private readonly thresholds: (profile: string,) => HealthThresholds;
  private readonly clock: HealthClock;

  /**
   * @param thresholds - per-profile thresholds (resolves config + defaults)
   * @param clock - time source; defaults to wall clock
   */
  constructor(
    thresholds: (profile: string,) => HealthThresholds,
    clock: HealthClock = realHealthClock,
  ) {
    this.thresholds = thresholds;
    this.clock = clock;
  }

  /**
   * Whether the profile may receive a dispatch now.
   * @param profile - profile name
   * @returns true while the breaker is closed or the cooldown has elapsed.
   */
  allow(profile: string,): boolean {
    const h = this.profiles.get(profile,);
    if (!h) { return true; }
    return this.clock() >= h.openUntil;
  }

  /**
   * Record a successful turn: reset the failure count and close the breaker.
   * @param profile - profile name
   */
  onSuccess(profile: string,): void {
    const h = this.profiles.get(profile,);
    if (h) {
      h.consecutiveFailures = 0;
      h.openUntil = 0;
    }
  }

  /**
   * Record a failed turn; opens the breaker once failures reach the threshold.
   * @param profile - profile name
   */
  onFailure(profile: string,): void {
    const { maxConsecutiveFailures, cooldownMs, } = this.thresholds(profile,);
    const h = this.entry(profile,);
    h.consecutiveFailures++;
    if (h.consecutiveFailures >= maxConsecutiveFailures) {
      h.openUntil = this.clock() + cooldownMs;
      h.consecutiveFailures = 0;
    }
  }

  /**
   * Remaining open-breaker time for a profile.
   * @param profile - profile name
   * @returns ms still blocked, 0 when allowed.
   */
  cooldownRemainingMs(profile: string,): number {
    const h = this.profiles.get(profile,);
    if (!h) { return 0; }
    return Math.max(0, h.openUntil - this.clock(),);
  }

  /**
   * Get (creating if needed) one profile's health state.
   * @param profile - profile name
   * @returns the entry.
   */
  private entry(profile: string,): ProfileHealth {
    let h = this.profiles.get(profile,);
    if (!h) {
      h = { consecutiveFailures: 0, openUntil: 0, };
      this.profiles.set(profile, h,);
    }

    return h;
  }
}
