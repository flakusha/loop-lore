// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset thumbnail_path column (TASK-thumbnail-generation-256px-webp-at-upload).
 */
import type { Kysely, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("assets",)
    .addColumn("thumbnail_path", "text",)
    .execute();
  await recordSchemaVersion(database, 33, "assets.thumbnail_path (256px WebP generated on upload)",);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("assets",)
    .dropColumn("thumbnail_path",)
    .execute();
}
