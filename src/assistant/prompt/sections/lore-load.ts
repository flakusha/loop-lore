// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * lore-load — extracted from `lore.ts` to keep that file under the 250-line
 * size limit. Loads actor + world lore rows + per-chat lifecycle config in a
 * single round of `Promise.allSettled`; downstream code consumes the typed
 * `LoadedLore` bundle.
 *
 * Resolves: TASK-world-lore-lifecycle-confidence-decay-distortion
 */
import { safeJsonParse, } from "@/utils/safe-json";
import { resolveLifecycleConfig, } from "../../lore/lifecycle";
import { resolveActorIdentity, } from "./lore-identity";
import type { LoreRow, } from "./lore-types";

/** Resolved bundle handed to the lore section's relevance + wrap pipeline. */
export interface LoadedLore {
  entries: LoreRow[];
  lifecycleConfig: ReturnType<typeof resolveLifecycleConfig>;
  actorIdentity: Awaited<ReturnType<typeof resolveActorIdentity>>;
}

/**
 * Issue the three SELECTs (actor lore + world lore + worlds.rules) and the
 * identity resolver in parallel; throw on the first rejection.
 * @param ctx Assemble context with db, chat, actor handles.
 * @param ctx.db Kysely db handle.
 * @param ctx.chat Chat row; `world_id` scopes the world lore query.
 * @param ctx.chat.id Chat identifier used to load the recent-conversation scan.
 * @param ctx.chat.world_id Optional world id; null skips the world lore query.
 * @param ctx.chat.current_location_id Optional current location (unused here, surfaced for type compatibility).
 * @param ctx.actor Actor row; only `id` is consulted.
 * @param ctx.actor.id Actor identifier used for the actor lore + identity queries.
 * @returns The {@link LoadedLore} bundle consumed by `loreSection`.
 */
export async function loadLore(
  ctx: {
    db: any;
    chat: { id: string; world_id?: string | null; current_location_id?: string | null };
    actor: { id: string };
  },
): Promise<LoadedLore> {
  const chat = ctx.chat;
  const results = await Promise.allSettled([
    ctx.db
      .selectFrom("actor_lore_entries",)
      .select([
        "content",
        "keys",
        "position",
        "constant",
        "selective",
        "cooldown_seconds",
        "last_activated",
        "id",
        "audience_scope",
        "key_type",
        "key_groups",
        "scan_depth",
        "activation_chance",
        "priority",
      ],)
      .where("actor_id", "=", ctx.actor.id,)
      .where("enabled", "=", "enabled",)
      .where((eb: any,) =>
        chat.world_id
          ? eb.or([
            eb("world_id", "is", null,),
            eb("world_id", "=", chat.world_id,),
          ],)
          : eb("world_id", "is", null,)
      )
      .orderBy("position", "asc",)
      .execute(),
    chat.world_id
      ? ctx.db
        .selectFrom("world_lore_entries",)
        .select([
          "content",
          "keys",
          "position",
          "constant",
          "selective",
          "cooldown_seconds",
          "last_activated",
          "id",
          "audience_scope",
          "key_type",
          "key_groups",
          "scan_depth",
          "activation_chance",
          "priority",
          "confidence",
          "last_verified",
          "distortion_level",
          "source_count",
          "disputed",
        ],)
        .where("world_id", "=", chat.world_id,)
        .where("enabled", "=", "enabled",)
        .orderBy("position", "asc",)
        .execute()
      : Promise.resolve([] as LoreRow[],),
    resolveActorIdentity(ctx.db, ctx.actor.id, chat.world_id ?? null,),
    chat.world_id
      ? ctx.db
        .selectFrom("worlds",)
        .select("rules",)
        .where("id", "=", chat.world_id,)
        .executeTakeFirst()
      : Promise.resolve(undefined as { rules: string | null } | undefined,),
  ],);

  const [actorR, worldR, identityR, worldRowR,] = results;
  if (actorR.status === "rejected") { throw actorR.reason; }
  if (worldR.status === "rejected") { throw worldR.reason; }
  if (identityR.status === "rejected") { throw identityR.reason; }
  if (worldRowR.status === "rejected") { throw worldRowR.reason; }

  const rawRules = worldRowR.value?.rules;
  let parsedRules: unknown = rawRules;
  if (typeof rawRules === "string") {
    const parsed = safeJsonParse<unknown>(rawRules,);
    if (parsed.ok) { parsedRules = parsed.value; }
  }
  return {
    entries: [...actorR.value, ...worldR.value,],
    lifecycleConfig: resolveLifecycleConfig(parsedRules,),
    actorIdentity: identityR.value,
  };
}
