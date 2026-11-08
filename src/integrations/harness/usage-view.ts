// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-side view over the harness runtime: the usage ledger's rolling
 * windows plus the per-profile breaker state, merged into one row per
 * profile.
 *
 * The admin usage endpoint and the Prometheus harness block read the SAME
 * rows through this module, so the two surfaces cannot drift on which
 * profiles exist or on what a profile's state means. Everything here is
 * read-only: the ledger snapshot never creates entries and the breaker is
 * only asked whether it currently blocks, never told anything.
 */
import type { HarnessRuntime, } from "./runtime";

/** One profile's usage windows and breaker state. */
export interface HarnessProfileUsage {
  /** Profile name. */
  profile: string;
  /** Dispatches inside the rolling 60s window. */
  dispatchesInWindow: number;
  /** Tokens consumed inside the rolling 24h window. */
  tokensInDay: number;
  /** Last reported quota reset (epoch ms), or null. */
  quotaResetAt: number | null;
  /** True while the profile's breaker blocks dispatches. */
  breakerOpen: boolean;
  /** Remaining breaker cooldown in ms (0 when the profile is not blocked). */
  breakerCooldownRemainingMs: number;
  /** How many times the profile's breaker has opened (process-lifetime). */
  breakerTrips: number;
}

/**
 * Merge the ledger snapshot with the breaker state, one row per profile.
 *
 * The profile set is the union of the profiles the ledger has seen and the
 * CONFIGURED ACP profiles: a breaker that tripped on a profile whose
 * dispatch never completed still has state worth reporting, and such a
 * profile has no ledger row.
 * @param runtime - the composed harness runtime.
 * @returns one row per profile, ledger rows first, then config-only profiles.
 */
export function harnessProfileUsage(runtime: HarnessRuntime,): HarnessProfileUsage[] {
  const snapshot = new Map(runtime.ledger.snapshot().map((row,) => [row.profile, row,]),);
  const names = new Set<string>(snapshot.keys(),);
  for (const profile of runtime.acp.profiles) { names.add(profile.name,); }

  const rows: HarnessProfileUsage[] = [];
  for (const name of names) {
    const row = snapshot.get(name,);
    rows.push({
      profile: name,
      dispatchesInWindow: row?.dispatchesInWindow ?? 0,
      tokensInDay: row?.tokensInDay ?? 0,
      quotaResetAt: row?.quotaResetAt ?? null,
      breakerOpen: !runtime.breaker.allow(name,),
      breakerCooldownRemainingMs: runtime.breaker.cooldownRemainingMs(name,),
      breakerTrips: runtime.breaker.tripCount(name,),
    },);
  }

  return rows;
}
