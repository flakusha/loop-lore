// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared helpers for assistant creation-wizard tools (Item 8 / C3).
 *
 * Resolves the target world for world-scoped entities (locations, items) from
 * the generating chat, and offers common string extraction used by all four
 * create_* tools. Mirrors the `/create` command's world resolution so both
 * entry points behave identically.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Fallback world id when no chat world can be resolved (matches /create). */
export const DEFAULT_WORLD_ID = "default";

/**
 * Resolve the world a chat-scoped entity belongs to.
 *
 * Prefers an explicit `worldId` parameter, then the generating chat's
 * `world_id`, then the `default` world. Never throws; returns a usable id.
 *
 * @param db - Kysely instance
 * @param chatId - Generating chat id (may be empty when unset)
 * @param explicitWorldId - Optional explicit world id from tool params
 * @returns The resolved world id
 */
export async function resolveWorldId(
  db: Kysely<DB>,
  chatId: string | undefined,
  explicitWorldId: string | undefined,
): Promise<string> {
  if (explicitWorldId?.trim()) { return explicitWorldId.trim(); }

  if (chatId) {
    const chat = await db
      .selectFrom("chats",)
      .select("world_id",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    if (chat?.world_id) { return chat.world_id; }
  }

  return DEFAULT_WORLD_ID;
}

/**
 * Resolve the owning user id for a tool-created entity.
 *
 * The tool execution context carries only `actorId` (the generating actor).
 * `owners`-style foreign keys (`actors.user_id`, `worlds.owner_id`) reference
 * `users.id`, so the owning user is resolved from the generating actor's
 * `user_id`. Returns null when the actor has no owning user.
 *
 * @param db - Kysely instance
 * @param actorId - Generating actor id
 * @returns The owning user id, or null when unresolvable
 */
export async function resolveOwnerUserId(
  db: Kysely<DB>,
  actorId: string,
): Promise<string | null> {
  const actor = await db
    .selectFrom("actors",)
    .select("user_id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  return actor?.user_id ?? null;
}

/**
 * Extract a trimmed, non-empty string parameter.
 *
 * @param params - Tool parameters object
 * @param key - Parameter key
 * @returns Trimmed value, or undefined when absent/empty/not a string
 */
export function stringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = params[key];
  if (typeof raw !== "string") { return undefined; }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
