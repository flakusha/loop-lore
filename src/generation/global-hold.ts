// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Global generation hold (kill-switch for NEW generations).
 *
 * Read fresh from `system_config` (`generation_paused`) on every check —
 * same rationale as the autonomy kill-switch: an operator flip takes
 * effect between requests with no restart. Missing/unparseable reads as
 * unheld (fail-open for availability; the per-chat hold still applies).
 *
 * Engaged: `validateGenerateRequest` refuses new generations (user-visible
 * 409), auto-gen schedulers skip before any provider call. In-flight
 * generations run to completion — hold refuses to START, never tears down.
 */
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../admin/config";
import type { DB, } from "../db/schema";

/** `system_config` key holding the global generation hold. `"true"` = held. */
export const GENERATION_PAUSED_KEY = "generation_paused";

/**
 * Whether the global generation hold is engaged right now.
 * @param db
 * @returns true when `generation_paused` is `"true"`
 */
export async function isGenerationHeld(db: Kysely<DB>,): Promise<boolean> {
  try {
    return (await getConfigValue(db, GENERATION_PAUSED_KEY,)) === "true";
  } catch {
    return false;
  }
}
