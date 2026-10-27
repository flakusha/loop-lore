// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Target-world context loading for the adaptation engine — the deterministic
 * (no-LLM) half of `/adapt`: the world row plus its enabled lore entries,
 * flattened to prompt-ready text. Lives with the other adapter loaders.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Maximum lore entries folded into the adaptation context. */
const MAX_LORE_ENTRIES = 10;

/** The loaded target-world context for one adaptation. */
export interface TargetWorldContext {
  name: string;
  context: string;
}

/**
 * Load the target world's context: name, description, lore, and lore-entry
 * contents.
 * @param db - database handle
 * @param worldId - target world
 * @returns the world name + flattened context text, or null when unknown
 */
export async function loadTargetWorldContext(
  db: Kysely<DB>,
  worldId: string,
): Promise<TargetWorldContext | null> {
  const world = await db
    .selectFrom("worlds",)
    .select(["name", "description", "lore",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (!world) { return null; }

  const loreRows = await db
    .selectFrom("world_lore_entries",)
    .select(["name", "content",],)
    .where("world_id", "=", worldId,)
    .where("enabled", "=", "enabled",)
    .limit(MAX_LORE_ENTRIES,)
    .execute();

  const context = [
    world.description ?? "",
    world.lore ?? "",
    ...loreRows.map((row,) => `${row.name ?? "Lore"}: ${row.content}`),
  ].filter((part,) => part !== "").join("\n",);

  return { name: world.name, context, };
}
