// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/peer-assignment-matrix.ts — persistence for the operator's
 * per-class preference list (the `PeerAssignmentMatrix` `resolvePeerRoute`
 * consumes).
 *
 * Stored as one `system_config` row rather than a new table: the epic's
 * migration plan (`067_mesh_work_assignments.ts`) covers the per-session sticky
 * PIN, not the operator's class→peers preference list, and this ticket adds no
 * migration. `system_config` is the existing admin-writable key/value store the
 * system-config panel already owns, so the matrix rides it instead of a fifth
 * persistence mechanism.
 *
 * A MISSING or unreadable row is an empty matrix, which the router already
 * treats as local-only — the same fail-closed default an empty matrix gives.
 */

import type { Kysely, } from "kysely";
import type { PeerWorkloadClass, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { jsonParseOr, safeJsonStringify, } from "../utils";
import { isPeerWorkloadClass, } from "./peer-capabilities";
import type { PeerAssignmentMatrix, } from "./peer-router";

/** `system_config` key holding the whole matrix as JSON. */
export const ASSIGNMENT_MATRIX_KEY = "federation.assignment_matrix";

/** The empty matrix: every class is local-only. */
const EMPTY_MATRIX: PeerAssignmentMatrix = { preferences: {}, };

/** Raw on-disk shape. Every field is untrusted until narrowed below. */
type StoredMatrix = { preferences?: unknown };

/**
 * Narrow a persisted matrix to the router's shape. Unknown classes and
 * non-string origins are DROPPED rather than passed through, so a hand-edited
 * row can widen the blast radius no further than the router already checks.
 *
 * @param raw Parsed JSON, or undefined when absent/malformed.
 * @returns {PeerAssignmentMatrix}
 */
function narrowMatrix(raw: StoredMatrix | undefined,): PeerAssignmentMatrix {
  if (raw === undefined || typeof raw.preferences !== "object" || raw.preferences === null) {
    return EMPTY_MATRIX;
  }

  const preferences: Partial<Record<PeerWorkloadClass, readonly string[]>> = {};
  for (const [className, origins,] of Object.entries(raw.preferences as Record<string, unknown>,)) {
    if (!isPeerWorkloadClass(className,)) {
      getChildLogger("federation/assignment-matrix",)?.warn("dropping unknown workload class from matrix", {
        workloadClass: className,
      },);

      continue;
    }

    if (!Array.isArray(origins,)) { continue; }

    const kept: string[] = [];
    for (const origin of origins) {
      if (typeof origin !== "string" || origin === "") { continue; }
      if (!kept.includes(origin,)) { kept.push(origin,); }
    }

    preferences[className] = kept;
  }

  return { preferences, };
}

/**
 * Read the operator's matrix. Absent or malformed reads back EMPTY, which the
 * router resolves to local-only for every class.
 *
 * @param database
 * @returns {Promise<PeerAssignmentMatrix>}
 */
export async function readAssignmentMatrix(database: Kysely<DB>,): Promise<PeerAssignmentMatrix> {
  const row = await database
    .selectFrom("system_config",)
    .select("value",)
    .where("key", "=", ASSIGNMENT_MATRIX_KEY,)
    .executeTakeFirst();

  if (row === undefined) { return EMPTY_MATRIX; }
  return narrowMatrix(jsonParseOr<StoredMatrix>(row.value, { preferences: {}, },),);
}

/**
 * Replace the operator's matrix wholesale. The panel edits a whole class row at
 * a time, so a full replace is the honest unit — there is no partial-row
 * merge that could leave two writers interleaving into one JSON blob.
 *
 * @param options
 * @param options.database
 * @param options.matrix Already narrowed by the caller's validation.
 * @returns {Promise<void>}
 * @throws {Error} when the matrix is not serializable.
 */
export async function writeAssignmentMatrix(
  options: { database: Kysely<DB>; matrix: PeerAssignmentMatrix },
): Promise<void> {
  const encoded = safeJsonStringify(options.matrix,);
  if (!encoded.ok) { throw new Error("peer assignment matrix not serializable",); }

  await options.database
    .insertInto("system_config",)
    .values({
      key: ASSIGNMENT_MATRIX_KEY,
      value: encoded.value,
      description: "Federation workload assignment matrix",
    },)
    .onConflict((oc,) =>
      oc.column("key",).doUpdateSet({ value: encoded.value, updated_at: new Date().toISOString(), },)
    )
    .execute();
}
