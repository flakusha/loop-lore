// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW consent state — per-user, per-chat explicit consent ledger.
 *
 * Replaces the prior in-memory auto-grant at
 * `src/middleware/nsfw-gate/consent.ts` (`loadOrCreateConsent`) which silently
 * granted every authenticated user consent on chat creation. The consent
 * gate was effectively a no-op (see git issue 4f8aeb2 / BUG-nsfw-consent-auto-granted).
 *
 * Shape:
 *   - one row per (user_id, chat_id, action) — `action` ∈ {"given","revoked"}.
 *   - latest row per (user_id, chat_id) wins; we never delete history.
 *   - `reason` is free-form but capped to 500 chars to prevent log injection.
 *   - `revoked_at` is denormalized on the latest "given" row for fast reads;
 *     subsequent "given" rows clear it.
 *
 * Why not a single row with a status column: history matters for audit and
 * appeal flows; an append-only ledger matches the rest of the moderation
 * surface (see `moderation_actions`).
 *
 * @see BUG-nsfw-consent-auto-granted-in-memory-for-any-logged-in-user-n.md
 * @see TASK-nsfw-consent-integration.md
 */

import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("nsfw_consent_state",)
    .ifNotExists()
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("nsfw_encounter",),)
    .addColumn("reason", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("revoked_at", "text",)
    .execute();

  // Latest-consent lookup is the hot path for `checkNsfwWithConsent`.
  // Composite index supports WHERE user_id = ? AND chat_id = ? ORDER BY created_at DESC.
  await db.schema
    .createIndex("idx_nsfw_consent_state_user_chat_created",)
    .ifNotExists()
    .on("nsfw_consent_state",)
    .columns(["user_id", "chat_id", "created_at",],)
    .execute();

  // Per-chat admin audit (who has consented to NSFW in this chat).
  await db.schema
    .createIndex("idx_nsfw_consent_state_chat",)
    .ifNotExists()
    .on("nsfw_consent_state",)
    .column("chat_id",)
    .execute();

  await db.schema
    .createIndex("idx_nsfw_consent_state_user",)
    .ifNotExists()
    .on("nsfw_consent_state",)
    .column("user_id",)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("nsfw_consent_state",).ifExists().execute();
}
