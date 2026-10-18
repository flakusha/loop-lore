// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `mesh_work_assignments` store — the persistence half of peer routing
 * (TASK-federation-workload-routing-policy). The pure policy is ./peer-router;
 * this module owns the two writes that policy implies and nothing else.
 *
 * A release is RECORDED, never silent. `releaseWorkAssignment` stamps
 * `released_at` / `release_reason` and leaves the row readable, and
 * `pinWorkloadPeer` copies the outgoing pin into `previous_origin` when it
 * replaces one. An operator asking "why did my chat stop running on the GPU
 * box?" reads that column; a silent delete would answer nothing.
 *
 * The write is an upsert on the `(affinity_key, workload_class)` primary key,
 * so two concurrent resolves for one session cannot create competing rows.
 */
import { type Kysely, sql, } from "kysely";
import { type PeerWorkloadClass, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import type { PeerWorkloadAssignment, } from "./peer-router";

/** Why a pin was dropped. Machine-readable; never a free-text message. */
export type WorkReleaseReason = "circuit-open" | "peer-ineligible" | "matrix-changed";

/** SQL now() — the store never calls Date.now(), so tests stay deterministic. */
const NOW = sql<string>`(datetime('now'))`;

/**
 * The live pin for one `(affinityKey, class)`, or null when there is none or
 * the pin has been released. A released row is indistinguishable from no row
 * to the router, which is the point: stickiness ends, the audit does not.
 * @param database
 * @param options
 * @param options.affinityKey
 * @param options.workloadClass
 * @returns {Promise<PeerWorkloadAssignment | null>}
 */
export async function readWorkAssignment(
  database: Kysely<DB>,
  options: { affinityKey: string; workloadClass: PeerWorkloadClass },
): Promise<PeerWorkloadAssignment | null> {
  const row = await database
    .selectFrom("mesh_work_assignments",)
    .select(["affinity_key", "workload_class", "peer_origin", "released_at",],)
    .where("affinity_key", "=", options.affinityKey,)
    .where("workload_class", "=", options.workloadClass,)
    .executeTakeFirst();

  if (!row || row.released_at !== null) { return null; }
  return {
    affinityKey: row.affinity_key,
    workloadClass: row.workload_class,
    peerOrigin: row.peer_origin,
  };
}

/**
 * Pin one session to one peer. When `replaces` is supplied the outgoing pin and
 * the reason it was dropped are recorded on the same row, so the swap is
 * auditable from this table alone.
 * @param database
 * @param options
 * @param options.affinityKey
 * @param options.workloadClass
 * @param options.peerOrigin
 * @param options.replaces
 * @returns {Promise<void>}
 */
export async function pinWorkloadPeer(
  database: Kysely<DB>,
  options: {
    affinityKey: string;
    workloadClass: PeerWorkloadClass;
    peerOrigin: string;
    replaces?: { previousOrigin: string; reason: WorkReleaseReason };
  },
): Promise<void> {
  const replaces = options.replaces;
  await database
    .insertInto("mesh_work_assignments",)
    .values({
      affinity_key: options.affinityKey,
      workload_class: options.workloadClass,
      peer_origin: options.peerOrigin,
      ...(replaces === undefined
        ? {}
        : { previous_origin: replaces.previousOrigin, release_reason: replaces.reason, }),
    },)
    .onConflict((conflict,) =>
      conflict.columns(["affinity_key", "workload_class",],).doUpdateSet({
        peer_origin: options.peerOrigin,
        assigned_at: NOW,
        previous_origin: replaces?.previousOrigin ?? null,
        // `released_at` marks THIS row's pin as dead. A fresh pin is live by
        // definition, so a reassignment clears it — the outgoing peer is the
        // audit, carried in `previous_origin` / `release_reason`.
        released_at: null,
        release_reason: replaces?.reason ?? null,
      },)
    )
    .execute();
}

/**
 * Drop a pin without naming a replacement (the class went local-only, or the
 * operator cleared it). The row survives as the audit trail.
 * @param database
 * @param options
 * @param options.affinityKey
 * @param options.workloadClass
 * @param options.reason
 * @returns {Promise<boolean>} whether a live pin was actually released.
 */
export async function releaseWorkAssignment(
  database: Kysely<DB>,
  options: { affinityKey: string; workloadClass: PeerWorkloadClass; reason: WorkReleaseReason },
): Promise<boolean> {
  const result = await database
    .updateTable("mesh_work_assignments",)
    .set({ released_at: NOW, release_reason: options.reason, },)
    .where("affinity_key", "=", options.affinityKey,)
    .where("workload_class", "=", options.workloadClass,)
    .where("released_at", "is", null,)
    .executeTakeFirst();

  const released = Number(result.numUpdatedRows ?? 0,) > 0;
  if (released) {
    getChildLogger("federation/peer-assignments",)?.info("sticky assignment released", {
      workloadClass: options.workloadClass,
      reason: options.reason,
    },);
  }

  return released;
}
