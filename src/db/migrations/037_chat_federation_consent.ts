// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 037_chat_federation_consent
 *
 * Per-chat federation opt-in for the content-clearance gate
 * (TASK-federation-content-clearance-gate-per-chat-consent-before-me):
 * `chats.federation_consented_at` is NULL unless the chat was explicitly
 * opted in, and reverts to NULL on revocation. Mesh membership alone must
 * never imply clearance to replicate a chat's content — the gate
 * (src/federation/clearance.ts) default-denies while this column is NULL.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("federation_consented_at", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("chats",).dropColumn("federation_consented_at",).execute();
}
