/**
 * SPDX-License-Identifier: LGPL-3.0-or-later
 * SPDX-FileCopyrightText: 2026 Loop Lore Contributors
 *
 * Migration 067 — Two-phase moderation appeal reversal
 *
 * Adds `superseded_by` to `moderation_actions` so an approved appeal can
 * mark the original action as superseded BEFORE a second-admin executes
 * the reversal (BUG-nsfw-reviewappeal-auto-reverses-actions).
 *
 * Two-phase posture:
 *   1. `reviewAppeal({ status: "approved" })` sets the appeal status to
 *      `pending_reversal` and writes `moderation_actions.superseded_by`
 *      pointing to the appeal id. No DB/state change to the user.
 *   2. A separate `executeReversal(appealId, executedBy)` route requires
 *      `admin.users` capability AND a `ctx.userId` different from the
 *      approver. Only then does the underlying block/ban/shadow lift.
 *
 * Reads still treat superseded rows as active until reversal executes
 * (so a hot-trigger attack cannot be neutralized by submitting appeals).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("moderation_actions",)
    .addColumn("superseded_by", "text",)
    .execute();

  await database.schema
    .createIndex("mod_actions_superseded_by_idx",)
    .on("moderation_actions",)
    .column("superseded_by",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("mod_actions_superseded_by_idx",).execute();
  await database.schema.alterTable("moderation_actions",).dropColumn("superseded_by",).execute();
}
