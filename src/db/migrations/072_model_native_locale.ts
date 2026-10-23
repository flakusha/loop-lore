// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 072_model_native_locale
 *
 * Per-model admin override of the LLM's native locale (FEAT-model-native-
 * locale-config). Nullable TEXT on `model_capabilities`; admin-authored via
 * PATCH /api/admin/model-capabilities. MUST stay out of both upsertModel-
 * Capabilities update sets AND the insert values so provider rescans never
 * clobber an admin-authored locale (same protection pattern as user
 * overrides). Append-only per current policy (compaction has not landed).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("model_capabilities",)
    .addColumn("native_locale", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("model_capabilities",)
    .dropColumn("native_locale",)
    .execute();
}
