// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/duplication.ts — duplication policy + target selection.
//
// `trusted` fans out to every trusted peer, `listed` intersects configured
// peers with the trusted set, `none` disables. Per-world overrides narrow
// the policy for pushes carrying a known world id. Coordinator-known
// inbound capacity filters candidates before any network attempt.

import type { Kysely, } from "kysely";
import type { DuplicationPolicy, WorldDuplicationPolicy, } from "../config/schema";
import type { DB, } from "../db/schema";
import { canonicalOrigin, } from "./peer-fetch";

/**
 * Effective duplication policy for one push: the per-world override when the
 * push carries a known world id, otherwise the top-level policy.
 * @param policy Configured duplication policy.
 * @param worldId World id carried by the push, if any.
 */
export function resolveDuplicationPolicy(
  policy: DuplicationPolicy,
  worldId?: string,
): WorldDuplicationPolicy {
  if (worldId !== undefined) {
    const override = policy.worlds?.[worldId];
    if (override !== undefined) { return override; }
  }
  return policy;
}

/**
 * Duplication targets under the configured policy, excluding one origin.
 * `trusted` fans out to every trusted peer; `listed` intersects the
 * configured peers with the trusted set; `none` disables duplication.
 * A push carrying a world id uses that world's override when configured.
 * @param database
 * @param policy
 * @param except Origin to exclude (usually the push source).
 * @param worldId World id carried by the push, if any.
 */
export async function selectDuplicationTargets(
  database: Kysely<DB>,
  policy: DuplicationPolicy,
  except?: string,
  worldId?: string,
): Promise<string[]> {
  const effective = resolveDuplicationPolicy(policy, worldId,);
  if (effective.mode === "none") { return []; }
  const rows = await database
    .selectFrom("mesh_peers",)
    .select(["origin",],)
    .where("state", "=", "trusted",)
    .orderBy("origin",)
    .execute();
  const trusted = new Set(rows.map((row,) => row.origin),);
  const candidates = effective.mode === "listed"
    ? effective.peers.map((raw,) => canonicalOrigin(raw,))
    : [...trusted,];
  return candidates.filter((origin,): origin is string => origin !== null && origin !== except && trusted.has(origin,));
}

/** Target skipped before any network attempt. */
export interface FanOutSkip {
  /** Target origin. */
  origin: string;
  /** Why no attempt was made. */
  reason: string;
}

/**
 * Filter candidate targets against coordinator-known inbound capacity.
 * Targets with unknown capacity (null, never advertised) are kept — the
 * receiver's reserve refusal stays the authoritative backstop. Only a
 * known finite capacity smaller than the payload skips the target.
 * @param database Sender database handle (peer registry read).
 * @param candidates Policy-selected target origins.
 * @param sizeBytes Payload byte length.
 */
export async function selectTargetsWithCapacity(
  database: Kysely<DB>,
  candidates: string[],
  sizeBytes: number,
): Promise<{ targets: string[]; skipped: FanOutSkip[] }> {
  if (candidates.length === 0) { return { targets: [], skipped: [], }; }
  const rows = await database
    .selectFrom("mesh_peers",)
    .select(["origin", "capacity_bytes",],)
    .where("origin", "in", candidates,)
    .execute();
  // Dynamic per-call snapshot keyed by arbitrary origins — Map, not Record.
  const capacity = new Map(rows.map((row,) => [row.origin, row.capacity_bytes,] as const),);
  const targets: string[] = [];
  const skipped: FanOutSkip[] = [];
  for (const candidate of candidates) {
    const known = capacity.get(candidate,);
    if (typeof known === "number" && Number.isFinite(known,) && sizeBytes > known) {
      skipped.push({ origin: candidate, reason: `known capacity ${known} < payload ${sizeBytes}`, },);
    } else {
      targets.push(candidate,);
    }
  }
  return { targets, skipped, };
}
