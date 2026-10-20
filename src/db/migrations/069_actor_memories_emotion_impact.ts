// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("emotion_impact", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("emotion_impact",)
    .execute();
}
