// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/routes/worlds/autonomy-control.ts — the autonomy WRITE surface
 *
 * The two owner-gated mutations: pause / resume / step a world's tick
 * loop, and set a single actor's pacing override. Split out of
 * ./autonomy-routes.ts, which keeps the read: a settings page needs to
 * see which layer set a value, and only the GET carries that.
 *
 * Both are owner-gated, and the actor route is gated a second time on the
 * actor itself — owning a world is not owning every actor in it.
 */

import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { resolveAutonomyLayers, } from "../../autonomy/config";
import type { AutonomyConfigOverride, } from "../../autonomy/config/types";
import { AutonomyScheduler, } from "../../autonomy/scheduler";
import { NO_CHAT, } from "../../autonomy/scheduler/store";
import { CharacterInternalTraitsService, } from "../../characters/services/internal-traits";
import type { DB, } from "../../db/schema";
import { ErrorResponse, } from "../../validation/schemas";
import { requireActorAccess, } from "../actor-auth";
import { extractAuth, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldOwner, } from "./access";

const controlBody = t.Object({
  action: t.Union([t.Literal("pause",), t.Literal("resume",), t.Literal("step",),],),
},);

/**
 * A replay seed: an integer, or `null` to un-seed. `hashSeed` runs
 * `String(part)` and `mulberry32` runs `seed >>> 0`, so an unvalidated
 * seed *coerces* instead of failing - a string or float would silently
 * turn an organic world into a deterministic one. Constrained here so a
 * bad value is a 422 and the stored layer is left untouched.
 */
const SeedSchema = t.Union([t.Integer(), t.Null(),],);

/**
 * A layer override. Only `seed` is typed; the other pacing fields stay
 * open so this stays a pass-through rather than a second copy of
 * `AutonomyConfigOverride` that would drift out of sync. The open keys
 * still reach the handler - `seed` alone has to match.
 */
const AutonomyOverrideBody = t.Object(
  { seed: t.Optional(SeedSchema,), },
  { additionalProperties: true, },
);

/**
 * Run one owner-scoped control action against a world's tick loop.
 *
 * `step` returns the tick outcome, not the cursor: the point of stepping
 * is to see what the tick actually did.
 *
 * @param database the request's Kysely handle
 * @param ctx the Elysia request context
 * @returns the control response, or a 403/500
 */
export async function autonomyControl(
  database: Kysely<DB>,
  ctx: any,
) {
  const { userId, userRole, } = extractAuth(ctx,);
  const { worldId, } = ctx.params as { worldId: string };
  const denied = await requireWorldOwner(database, worldId, userId, userRole,);
  if (denied) { return denied; }

  const scheduler = new AutonomyScheduler(database,);
  const { action, } = ctx.body as { action: "pause" | "resume" | "step" };
  try {
    if (action === "pause") { return jsonResponse(await scheduler.pause(worldId,),); }
    if (action === "resume") { return jsonResponse(await scheduler.resume(worldId,),); }
    return jsonResponse({ tick: await scheduler.stepOnce(worldId,), },);
  } catch (err) {
    return jsonError({ message: `Autonomy ${action} failed: ${String(err,)}`, status: 500, },);
  }
}

/**
 * Set one actor's autonomy pacing override — the highest-precedence
 * layer.
 *
 * `{}` is how the per-actor layer says "no override of my own"; that is
 * also the clear, so the panel never sends null here. The response is the
 * full resolved layer set so the editor re-renders from one read.
 *
 * @param database the request's Kysely handle
 * @param ctx the Elysia request context
 * @returns the resolved layers, or a 401/403/404/500
 */
export async function setActorAutonomy(
  database: Kysely<DB>,
  ctx: any,
) {
  const { userId, userRole, } = extractAuth(ctx,);
  const { worldId, actorId, } = ctx.params as { worldId: string; actorId: string };
  const denied = await requireWorldOwner(database, worldId, userId, userRole,);
  if (denied) { return denied; }

  // Owning the world is not owning every actor in it: an admin can
  // hold world ownership without owning the cast. Gate the actor
  // layer on the same helper the traits route uses.
  const access = await requireActorAccess(
    { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
    database,
  );
  if (access instanceof Response) { return access; }

  const { autonomy, } = ctx.body as { autonomy?: AutonomyConfigOverride };
  const svc = new CharacterInternalTraitsService(database,);
  try {
    await svc.upsert(actorId, { autonomyPreferences: { autonomy: autonomy ?? {}, }, },);
    return jsonResponse(
      await resolveAutonomyLayers(database, { worldId, chatId: NO_CHAT, actorId, },),
    );
  } catch (err) {
    return jsonError({ message: `Failed to save actor autonomy: ${String(err,)}`, status: 500, },);
  }
}

/** The control route's request schema. */
export const controlSchema = { body: controlBody, };

/** The actor-override route's request schema. */
export const actorOverrideSchema = {
  body: t.Object({ autonomy: t.Optional(AutonomyOverrideBody,), },),
};

/** Response maps both write routes share. */
export const controlResponse = { 200: t.Any(), 401: ErrorResponse, 403: ErrorResponse, };

/** The actor route also reports 404 for an unknown actor. */
export const actorOverrideResponse = { 200: t.Any(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, };
