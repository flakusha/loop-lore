// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { GenerationStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";

/**
 * Check if a generation attempt with the given idempotency key
 * is in-flight (to prevent duplicate retries).
 */
export async function hasInFlightGeneration(db: Kysely<DB>, idempotencyKey: string,): Promise<boolean> {
  const existing = await db
    .selectFrom("generation_attempts",)
    .select("id",)
    .where("idempotency_key", "=", idempotencyKey,)
    .where("status", "in", [
      GenerationStatus.Pending,
      GenerationStatus.Processing,
      GenerationStatus.Streaming,
    ],)
    .executeTakeFirst();

  return existing !== undefined;
}
