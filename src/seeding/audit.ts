// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/audit.ts — seed audit trail helper
//
// Records a row in `seed_audit` for each entity created by the content seeding
// pipeline, so operators can see which entities were seeded, by whom, and in
// which environment.

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { safeJsonStringify, uid, } from "../utils";

/**
 * Record a seed event in the `seed_audit` table.
 * @param database - Kysely instance
 * @param seedType - Entity type, e.g. "character" | "world" | "chat"
 * @param seedId - ID of the seeded entity
 * @param metadata - Optional structured detail (username/owners/participants)
 */
export async function recordSeedAudit(
  database: Kysely<DB>,
  seedType: string,
  seedId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const json = metadata ? safeJsonStringify(metadata,) : { ok: true, value: null, };
  await database
    .insertInto("seed_audit",)
    .values({
      id: uid(),
      seed_type: seedType,
      seed_id: seedId,
      seeded_by: "system",
      seeded_at: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "development",
      metadata: json.ok ? json.value : null,
    },)
    .execute();
}
