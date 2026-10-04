// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Autonomy read surface for a world.
 *
 * The GET is what a settings page needs to show inherited-vs-overridden:
 * the resolved config alone cannot say which layer set a value, so the
 * per-layer overrides ride along.
 *
 * The two writes — the human-in-loop controls (pause / resume / step)
 * that `AutonomyScheduler` already implements, and the per-actor pacing
 * override — live in ./autonomy-control.ts, and are mounted here so the
 * plugin still registers all three under one Elysia name.
 */

import { Elysia, t, } from "elysia";

import type { Kysely, } from "kysely";
import { resolveAutonomyLayers, } from "../../autonomy/config";
import { PRESETS, } from "../../autonomy/config/presets";
import { AutonomyGovernor, } from "../../autonomy/governor";
import type { AutonomyScopeKind, } from "../../autonomy/governor/types";
import { AutonomyScheduler, } from "../../autonomy/scheduler";
import { NO_CHAT, } from "../../autonomy/scheduler/store";
import type { DB, } from "../../db/schema";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldOwner, } from "./access";
import {
  actorOverrideResponse,
  actorOverrideSchema,
  autonomyControl,
  controlResponse,
  controlSchema,
  setActorAutonomy,
} from "./autonomy-control";
import type { HandleOpts, } from "./types";

/** Query the read accepts: which layer to resolve, plus an optional
 *  actor so the highest-precedence layer is visible too.
 */
const autonomyQuery = t.Object({
  chatId: t.Optional(t.String(),),
  actorId: t.Optional(t.String(),),
  scopeKind: t.Optional(t.Union([t.Literal("actor",), t.Literal("user",),],),),
  scopeId: t.Optional(t.String(),),
},);

/**
 * The characters bound to a world, for the per-actor override picker.
 *
 * @param database the request's Kysely handle
 * @param worldId the world whose members to list
 * @returns id and display name per member, name-sorted
 */
async function listWorldActors(database: Kysely<DB>, worldId: string,): Promise<
  { id: string; name: string }[]
> {
  const rows = await database
    .selectFrom("world_members",)
    .innerJoin("actors", "actors.id", "world_members.actor_id",)
    .select(["actors.id", "actors.display_name as name",],)
    .where("world_members.world_id", "=", worldId,)
    .orderBy("actors.display_name",)
    .execute();

  return rows;
}

/**
 * Owner-scoped autonomy read + loop control for a world.
 *
 * @param opts the shared route handle (database, config)
 * @param prefix route prefix, injected by the worlds router
 * @returns the Elysia plugin exposing the autonomy routes
 */
export function autonomyRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-autonomy", },)
    .get(
      `${prefix}/worlds/:worldId/autonomy`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const { worldId, } = ctx.params as { worldId: string };
        // Owner-scoped: the layers include budget caps, which is spend
        // configuration, not public world data.
        const denied = await requireWorldOwner(database, worldId, userId, userRole,);
        if (denied) { return denied; }

        const q = (ctx.query ?? {}) as {
          chatId?: string;
          actorId?: string;
          scopeKind?: AutonomyScopeKind;
          scopeId?: string;
        };

        const chatId = q.chatId || NO_CHAT;
        try {
          const { layers, resolved, } = await resolveAutonomyLayers(database, {
            worldId,
            chatId,
            actorId: q.actorId || undefined,
          },);

          return jsonResponse({
            layers,
            resolved,
            // Definitions, not just names: a picker that shows a preset
            // label also has to show what picking it would do.
            presets: PRESETS,
            // The world settings page has no character in context, so the
            // per-actor editor needs a picker. Same owner gate as the
            // rest of this payload: these are the world's members.
            actors: await listWorldActors(database, worldId,),
            simulation: await new AutonomyScheduler(database,).stateFor(worldId,),
            // Budget is optional: a scope the caller did not name has
            // no budget to report, and an unbounded one reports null
            // remaining rather than a fake number. The cap comes from
            // the config resolved above, so the ceiling shown here is
            // the one the tick loop actually charges against.
            budget: q.scopeId
              ? await peekBudget(
                database,
                q.scopeKind ?? "user",
                q.scopeId,
                (q.scopeKind ?? "user") === "actor" ? resolved.perAgentCap : resolved.perUserCap,
                q.chatId,
              )
              : null,
          },);
        } catch (err) {
          return jsonError({
            message: `Failed to read autonomy config: ${String(err,)}`,
            status: 500,
          },);
        }
      },
      {
        query: autonomyQuery,
        response: { 200: t.Any(), 401: ErrorResponse, 403: ErrorResponse, },
        detail: {
          summary: "Get the autonomy config for a world",
          description:
            "Returns the per-layer overrides, the resolved config, the built-in presets, the persisted simulation cursor, and — when scopeId is given — the current budget window.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/autonomy/control`,
      async (ctx: any,) => autonomyControl(database, ctx,),
      {
        ...controlSchema,
        response: controlResponse,
        detail: {
          summary: "Pause, resume, or single-step a world's autonomy loop",
          description:
            "Human-in-loop control over the world tick. `step` forces one tick regardless of the pause flag and cursor; the pause survives it.",
          tags: ["Worlds",],
        },
      },
    )
    .put(
      `${prefix}/worlds/:worldId/autonomy/actor/:actorId`,
      async (ctx: any,) => setActorAutonomy(database, ctx,),
      {
        ...actorOverrideSchema,
        response: actorOverrideResponse,
        detail: {
          summary: "Set a character's autonomy pacing override",
          description:
            "Writes the per-actor layer (the highest-precedence override) and returns the full resolved layer set. Send an empty object to clear the override.",
          tags: ["Worlds",],
        },
      },
    );
}

/**
 * Read the budget window for one scope without consuming from it.
 *
 * The cap is passed explicitly from the config this request already
 * resolved. Letting `peek` re-resolve would answer for a sentinel world
 * and report a ceiling the tick loop does not actually enforce - the UI
 * would show a budget the governor is not holding you to.
 *
 * @param db database handle
 * @param kind actor or user scope
 * @param scopeId the actor or user id
 * @param cap the cap in force for this scope kind
 * @param chatId chat context, for telemetry scoping
 * @returns the live window, or null remaining when unbounded
 */
async function peekBudget(
  db: Kysely<DB>,
  kind: AutonomyScopeKind,
  scopeId: string,
  cap: number | null,
  chatId: string | undefined,
) {
  const win = await new AutonomyGovernor().peek(db, { kind, id: scopeId, }, "per_minute_generation", {
    cap,
    chatId,
  },);

  return { scopeKind: kind, scopeId, ...win, };
}
