// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-profile rolling-window usage ledger (instance-owned — never a module
 * singleton, so parallel test suites never share state).
 *
 * Tracks prompt dispatches (rpm: rolling 60s) and tokens (tokensPerDay:
 * rolling 24h) per profile, plus optional externally-reported quota skips
 * (`_omp/usage`-style exhausted reports with a reset time).
 */

import { parseExpiryMs, } from "../../utils/date";
import type { HarnessUsageReport, } from "./adapter-types";

/** Injected clock so tests drive windows without sleeps. */
export type LedgerClock = () => number;

/** Real time, the production clock. */
export const realClock: LedgerClock = () => Date.now();

/** Window lengths: rpm = 60s, tokensPerDay = 24h. */
const RPM_WINDOW_MS = 60_000;
const DAY_WINDOW_MS = 86_400_000;

/** A profile's recorded usage events. */
interface ProfileLedger {
  /** Timestamps of prompt dispatches (for the rpm window). */
  dispatches: number[];
  /** `[timestamp, tokens]` pairs (for the tokensPerDay window). */
  tokens: Array<[number, number,]>;
  /** Externally reported quota reset (epoch ms), or null. */
  quotaResetAt: number | null;
}

/** Verdict for one profile against its configured limits. */
export type LedgerVerdict =
  | { allowed: true }
  | { allowed: false; reason: "rpm" | "tokensPerDay" | "quota"; retryAtMs: number | null };

/** Limits a profile is held to; absent keys are unlimited. */
export interface LedgerLimits {
  rpm?: number;
  tokensPerDay?: number;
}

/** */
export class UsageLedger {
  private readonly profiles = new Map<string, ProfileLedger>();
  private readonly clock: LedgerClock;

  /**
   * @param clock - time source; defaults to wall clock
   */
  constructor(clock: LedgerClock = realClock,) {
    this.clock = clock;
  }

  /**
   * Record one finished dispatch: a prompt event plus its token cost.
   * @param profile - profile name
   * @param tokens - total tokens (in + out) consumed, 0 when unknown
   */
  record(profile: string, tokens: number,): void {
    const now = this.clock();
    const entry = this.entry(profile,);
    entry.dispatches.push(now,);
    entry.tokens.push([now, Math.max(0, tokens,),],);
    this.prune(entry, now,);
  }

  /**
   * Fold external quota reports in: an exhausted report blocks the profile
   * until its window resets; null reports leave the ledger as sole authority.
   * @param profile - profile name
   * @param reports - normalized usage reports, or null when unsupported
   */
  applyUsageReports(profile: string, reports: HarnessUsageReport[] | null,): void {
    if (reports === null) { return; }
    const entry = this.entry(profile,);
    for (const r of reports) {
      if (r.status !== "exhausted") { continue; }
      const resetMs = r.resetsAt !== null ? parseExpiryMs(r.resetsAt,) : null;
      // Keep the furthest reset — the strictest known blocker wins.
      if (entry.quotaResetAt === null || (resetMs !== null && resetMs > entry.quotaResetAt)) {
        entry.quotaResetAt = resetMs;
      }
    }
  }

  /**
   * Check whether a profile may dispatch now under its limits.
   * @param profile - profile name
   * @param limits - the profile's configured caps (absent = unlimited)
   * @returns allowed, or the blocked reason with the earliest retry time.
   */
  check(profile: string, limits: LedgerLimits | undefined,): LedgerVerdict {
    const now = this.clock();
    const entry = this.entry(profile,);
    this.prune(entry, now,);
    if (entry.quotaResetAt !== null) {
      if (now < entry.quotaResetAt) {
        return { allowed: false, reason: "quota", retryAtMs: entry.quotaResetAt, };
      }

      entry.quotaResetAt = null;
    }

    if (limits?.rpm !== undefined && entry.dispatches.length >= limits.rpm) {
      const oldest = entry.dispatches[0] ?? now;
      return { allowed: false, reason: "rpm", retryAtMs: oldest + RPM_WINDOW_MS, };
    }

    if (limits?.tokensPerDay !== undefined) {
      const used = entry.tokens.reduce((sum, [, t,],) => sum + t, 0,);
      if (used >= limits.tokensPerDay) {
        const oldest = entry.tokens[0]?.[0] ?? now;
        return { allowed: false, reason: "tokensPerDay", retryAtMs: oldest + DAY_WINDOW_MS, };
      }
    }

    return { allowed: true, };
  }

  /**
   * Get (creating if needed) one profile's ledger entry.
   * @param profile - profile name
   * @returns the entry.
   */
  private entry(profile: string,): ProfileLedger {
    let e = this.profiles.get(profile,);
    if (!e) {
      e = { dispatches: [], tokens: [], quotaResetAt: null, };
      this.profiles.set(profile, e,);
    }

    return e;
  }

  /**
   * Drop events that fell out of both windows.
   * @param entry - ledger entry to prune in place
   * @param now - current time
   */
  private prune(entry: ProfileLedger, now: number,): void {
    entry.dispatches = entry.dispatches.filter((t,) => now - t < RPM_WINDOW_MS);
    entry.tokens = entry.tokens.filter(([t,],) => now - t < DAY_WINDOW_MS);
  }
}
