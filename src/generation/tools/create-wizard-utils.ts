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
import { requireWorldAccess, } from "../../routes/worlds/access";

/** Fallback world id when no chat world can be resolved (matches /create). */
export const DEFAULT_WORLD_ID = "default";

/**
 * The world a creation tool may write into: the generating chat's own world,
 * or the `default` world when the chat names none — and only when the
 * generating actor's owning user may act in it.
 */
export type WorldResolution = { ok: true; worldId: string } | { ok: false; message: string };

/**
 * Resolve AND authorize the world a chat-scoped entity belongs to.
 *
 * This is the single authorization point every world-scoped creation tool
 * routes through, so no call site can skip it. There is deliberately NO
 * tool-parameter input: a `worldId` argument is model-authored, and letting
 * it choose the destination would hand an authorization decision to a
 * non-deterministic third party (BUG-llm-chosen-worldid-cross-world-write).
 * The chat's own `world_id` is the only source, and the resolved world is
 * still checked against the generating actor's user.
 * @param db - Kysely instance
 * @param ctx.chatId - Generating chat id (may be empty when unset)
 * @param ctx.actorId - Generating actor id
 * @returns the world to write into, or the refusal to report back
 */
export async function resolveWorldId(
  db: Kysely<DB>,
  ctx: { chatId: string | undefined; actorId: string },
): Promise<WorldResolution> {
  let worldId = DEFAULT_WORLD_ID;

  if (ctx.chatId) {
    const chat = await db
      .selectFrom("chats",)
      .select("world_id",)
      .where("id", "=", ctx.chatId,)
      .executeTakeFirst();

    if (chat?.world_id) { worldId = chat.world_id; }
  }

  const userId = await resolveOwnerUserId(db, ctx.actorId,);
  const denied = await requireWorldAccess(db, worldId, userId, null,);
  if (denied) { return { ok: false, message: `World "${worldId}" not found or access denied.`, }; }

  return { ok: true, worldId, };
}

/**
 * Resolve the owning user id for a tool-created entity.
 *
 * The tool execution context carries only `actorId` (the generating actor).
 * `owners`-style foreign keys (`actors.user_id`, `worlds.owner_id`) reference
 * `users.id`, so the owning user is resolved from the generating actor's
 * `user_id`. Returns null when the actor has no owning user.
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
