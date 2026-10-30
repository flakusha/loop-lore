// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * lore-load — extracted from `lore.ts` to keep that file under the 250-line
 * size limit. Loads actor + world lore rows + per-chat lifecycle config in a
 * single round of `Promise.allSettled`; downstream code consumes the typed
 * `LoadedLore` bundle.
 *
 * Timeline scoping (084, epic-lore-knowledge): rows carry a nullable
 * `timeline_id`; NULL rows exist on every timeline, non-NULL rows only on the
 * chat's own timeline (`chats.timeline_id`, default 'prime'). Timeline-event
 * ground truth for reveal conditions lives in `lore-timeline.ts`.
 *
 * Resolves: TASK-world-lore-lifecycle-confidence-decay-distortion,
 *           BUG-lore-load-ts-uses-any-for-db-eb-instead-of-kysely-expression,
 *           epic-lore-knowledge (timeline-scoped lore + reveal conditions).
 */
import { safeJsonParse, } from "@/utils";
import type { ExpressionBuilder, Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { resolveLifecycleConfig, } from "../../lore/lifecycle";
import type { AssembleContext, } from "../types";
import { resolveActorIdentity, } from "./lore-identity";
import { loadRevealTimelineEvents, type TimelineEventScan, } from "./lore-timeline";
import type { LoreRow, } from "./lore-types";

/** Fallback timeline slug matching the `chats.timeline_id` default. */
const DEFAULT_TIMELINE = "prime";

/** Resolved bundle handed to the lore section's relevance + wrap pipeline. */
export interface LoadedLore {
  entries: LoreRow[];
  lifecycleConfig: ReturnType<typeof resolveLifecycleConfig>;
  actorIdentity: Awaited<ReturnType<typeof resolveActorIdentity>>;
  /** Timeline events for reveal evaluation; empty when nothing needs them. */
  timelineEvents: TimelineEventScan;
}

/**
 * Typed SELECT over `actor_lore_entries` for one actor, optionally
 * restricting rows to a world scope and the chat's timeline. The eb callback
 * uses `ExpressionBuilder<DB, "actor_lore_entries">` so the where-clause
 * expressions are checked against the table's column set.
 * @param db
 * @param actorId
 * @param worldId
 * @param timelineId Chat's timeline slug; non-NULL `timeline_id` rows outside
 *   it are excluded (NULL rows are timeline-universal).
 * @returns All enabled lore rows for the actor, world-scoped when given.
 */
function actorLoreQuery(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null,
  timelineId: string,
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
      "reveal_condition",
      "timeline_id",
      "rarity",
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
    .where((eb: ExpressionBuilder<DB, "actor_lore_entries">,) =>
      eb.or([
        eb("timeline_id", "is", null,),
        eb("timeline_id", "=", timelineId,),
      ],)
    )
    .orderBy("position", "asc",)
    .execute();
}

/**
 * Issue the actor-lore + world-lore + worlds.rules SELECTs and the
 * identity resolver in parallel; throw on the first rejection. Timeline
 * events are scanned afterwards, only when a reveal condition needs them.
 *
 * @param ctx Standard {@link AssembleContext} — same shape every other
 *   lore section consumes. Using the typed ctx (instead of an ad-hoc
 *   `db: any`) surfaces column typos at compile time and matches the
 *   convention enforced by the `route-ctx-typing` skill.
 * @returns The {@link LoadedLore} bundle consumed by `loreSection`.
 * @throws {Error}
 * @throws {Error}
 * @throws {Error}
 * @throws {Error}
 * @throws {Error}
 */
export async function loadLore(
  ctx: Pick<AssembleContext, "db" | "chat" | "actor">,
): Promise<LoadedLore> {
  const chat = ctx.chat;
  const timelineId = chat.timeline_id ?? DEFAULT_TIMELINE;
  const results = await Promise.allSettled([
    actorLoreQuery(ctx.db, ctx.actor.id, chat.world_id ?? null, timelineId,),
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
          "reveal_condition",
          "timeline_id",
          "rarity",
        ],)
        .where("world_id", "=", chat.world_id,)
        .where("enabled", "=", "enabled",)
        .where((eb: ExpressionBuilder<DB, "world_lore_entries">,) =>
          eb.or([
            eb("timeline_id", "is", null,),
            eb("timeline_id", "=", timelineId,),
          ],)
        )
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

  const entries: LoreRow[] = [...actorR.value, ...worldR.value,];
  return {
    entries,
    lifecycleConfig: resolveLifecycleConfig(parsedRules,),
    actorIdentity: identityR.value,
    timelineEvents: await loadRevealTimelineEvents(
      ctx.db,
      chat.world_id ?? null,
      timelineId,
      entries,
    ),
  };
}
