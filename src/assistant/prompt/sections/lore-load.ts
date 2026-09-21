// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * lore-load — extracted from `lore.ts` to keep that file under the 250-line
 * size limit. Loads actor + world lore rows + per-chat lifecycle config in a
 * single round of `Promise.allSettled`; downstream code consumes the typed
 * `LoadedLore` bundle.
 *
 * Resolves: TASK-world-lore-lifecycle-confidence-decay-distortion,
 *           BUG-lore-load-ts-uses-any-for-db-eb-instead-of-kysely-expression.
 */
import type { ExpressionBuilder, Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { safeJsonParse, } from "@/utils/safe-json";
import { resolveLifecycleConfig, } from "../../lore/lifecycle";
import { resolveActorIdentity, } from "./lore-identity";
import type { AssembleContext, } from "../types";
import type { LoreRow, } from "./lore-types";

/** Resolved bundle handed to the lore section's relevance + wrap pipeline. */
export interface LoadedLore {
  entries: LoreRow[];
  lifecycleConfig: ReturnType<typeof resolveLifecycleConfig>;
  actorIdentity: Awaited<ReturnType<typeof resolveActorIdentity>>;
}

/**
 * Typed SELECT over `actor_lore_entries` for one actor, optionally
 * restricting rows to a world scope. The eb callback uses
 * `ExpressionBuilder<DB, "actor_lore_entries">` so the where-clause
 * expressions are checked against the table's column set.
 */
function actorLoreQuery(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null,
) {
  return db
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
    .where("actor_id", "=", actorId,)
    .where("enabled", "=", "enabled",)
    .where((eb: ExpressionBuilder<DB, "actor_lore_entries">,) =>
      worldId
        ? eb.or([
          eb("world_id", "is", null,),
          eb("world_id", "=", worldId,),
        ],)
        : eb("world_id", "is", null,)
    )
    .orderBy("position", "asc",)
    .execute();
}

/**
 * Issue the actor-lore + world-lore + worlds.rules SELECTs and the
 * identity resolver in parallel; throw on the first rejection.
 *
 * @param ctx Standard {@link AssembleContext} — same shape every other
 *   lore section consumes. Using the typed ctx (instead of an ad-hoc
 *   `db: any`) surfaces column typos at compile time and matches the
 *   convention enforced by the `route-ctx-typing` skill.
 * @returns The {@link LoadedLore} bundle consumed by `loreSection`.
 */
export async function loadLore(
  ctx: Pick<AssembleContext, "db" | "chat" | "actor">,
): Promise<LoadedLore> {
  const chat = ctx.chat;
  const results = await Promise.allSettled([
    actorLoreQuery(ctx.db, ctx.actor.id, chat.world_id ?? null,),
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
