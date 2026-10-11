// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 054_gm_notes_trigger_message_reveal
 *
 * Close the unticketed gaps of epic-gm-shadow-notes with three nullable
 * columns (append-only; 001/002/004 are shipped):
 *
 *   - `shadow_notes.trigger_condition` — free-form activation trigger stored
 *     verbatim (spec §Shadow Notes: "when to activate this shadow note").
 *     Behavioural evaluation is deferred to the GM/assistant; the column only
 *     carries the declaration surfaced in CRUD + prompt assembly.
 *   - `shadow_notes.revealed_to` — JSON array of player/character ids a
 *     revealed note was surfaced to (per-player reveal tracking; not a join
 *     table — reveals are rare and low-cardinality).
 *   - `whitenotes.message_id` — nullable FK to `messages.id`. The spec is
 *     message-scoped, the shipped schema chat-scoped; a nullable column
 *     reconciles both without touching existing chat-scoped rows.
 *
 * All three start NULL: existing rows stay chat-scoped / trigger-less /
 * unrevealed, which is exactly their current behaviour.
 */
import type { Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // SQLite only allows one column per ALTER TABLE.
  await database.schema
    .alterTable("shadow_notes",)
    .addColumn("trigger_condition", "text",)
    .execute();

  await database.schema
    .alterTable("shadow_notes",)
    .addColumn("revealed_to", "text",)
    .execute();

  await database.schema
    .alterTable("whitenotes",)
    .addColumn("message_id", "text", (col,) => col.references("messages.id",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("whitenotes",)
    .dropColumn("message_id",)
    .execute();

  await database.schema
    .alterTable("shadow_notes",)
    .dropColumn("revealed_to",)
    .execute();

  await database.schema
    .alterTable("shadow_notes",)
    .dropColumn("trigger_condition",)
    .execute();
}
