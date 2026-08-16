// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";

/**
 * Model capabilities registry — persistent storage for provider-reported
 * model metadata (context window, max output, tool calling, vision, etc.)
 * with user-override support.
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("model_capabilities",)
    .addColumn("id", "text", (c,) => c.notNull().primaryKey(),)
    .addColumn("provider_id", "text", (c,) => c.notNull(),)
    .addColumn("model_id", "text", (c,) => c.notNull(),)
    .addColumn("context_window", "integer",)
    .addColumn("max_output", "integer",)
    .addColumn("supports_tools", "integer", (c,) => c.defaultTo(0,),) // boolean: 0/1
    .addColumn("supports_vision", "integer", (c,) => c.defaultTo(0,),)
    .addColumn("supports_thinking", "integer", (c,) => c.defaultTo(0,),)
    .addColumn("modalities", "text",) // JSON array
    .addColumn("param_size", "text",)
    .addColumn("owned_by", "text",)
    .addColumn("user_override", "integer", (c,) => c.notNull().defaultTo(0,),) // boolean: 0/1
    .addColumn("notes", "text",)
    .addColumn("last_seen", "text", (c,) => c.notNull(),)
    .addColumn("created_at", "text", (c,) => c.notNull(),)
    .addColumn("updated_at", "text", (c,) => c.notNull(),)
    .addUniqueConstraint("uq_provider_model", ["provider_id", "model_id",],)
    .execute();

  // Index for lookups by provider
  await db.schema
    .createIndex("idx_model_capabilities_provider",)
    .on("model_capabilities",)
    .columns(["provider_id",],)
    .execute();

  // Index for staleness queries
  await db.schema
    .createIndex("idx_model_capabilities_last_seen",)
    .on("model_capabilities",)
    .columns(["last_seen",],)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("idx_model_capabilities_last_seen",).execute();
  await db.schema.dropIndex("idx_model_capabilities_provider",).execute();
  await db.schema.dropTable("model_capabilities",).execute();
}
