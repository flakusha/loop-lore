// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generic random-encounter endpoints (059). Unrelated to the NSFW
 * encounter CRUD in ./rpg/encounters — different tables, different routes.
 *
 *   GET    /api/worlds/:worldId/encounter-templates
 *   POST   /api/worlds/:worldId/encounters/roll
 *   POST   /api/worlds/:worldId/encounters/:rollId/outcome
 *   GET    /api/worlds/:worldId/encounters/context
 *
 * Every route here takes `requireWorldAccess`, not the owner gate: rolling
 * an encounter and annotating its outcome are things any member of the
 * world does during play. Only writing templates is owner territory, and
 * that lives on the templates POST.
 */
import { Elysia, t, } from "elysia";
import { safeJsonStringify, } from "../../utils";
import {
  EncounterTemplateStateSchema,
  EncounterTravelPhaseSchema,
  EncounterTriggerTypeSchema,
  EncounterTypeSchema,
} from "../../validation/db-schemas";
import { ErrorResponse, } from "../../validation/schemas";
import { buildEncounterContext, } from "../../worlds/encounter-context";
import { EncounterError, recordEncounterOutcome, rollEncounter, } from "../../worlds/random-encounters";
import { extractAuth, HttpStatus, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** Body of the template creation POST (owner only). */
const CreateTemplateBody = t.Object({
  name: t.String({ minLength: 1, },),
  type: t.Optional(EncounterTypeSchema,),
  triggerType: t.Optional(EncounterTriggerTypeSchema,),
  triggerChance: t.Optional(t.Number({ minimum: 0, maximum: 1, },),),
  cooldownSeconds: t.Optional(t.Number(),),
  difficulty: t.Optional(t.Number({ minimum: 0, maximum: 100, },),),
  requirements: t.Optional(t.Record(t.String(), t.Unknown(),),),
  rewards: t.Optional(t.Record(t.String(), t.Unknown(),),),
  consequences: t.Optional(t.Record(t.String(), t.Unknown(),),),
  storyNotes: t.Optional(t.Nullable(t.String(),),),
  assistantDriven: t.Optional(t.UnionEnum(["automatic", "assistant",],),),
  travelPhase: t.Optional(t.Nullable(EncounterTravelPhaseSchema,),),
  active: t.Optional(EncounterTemplateStateSchema,),
},);

/** Body of the roll POST. */
const RollBody = t.Object({
  triggerType: EncounterTriggerTypeSchema,
  rngSeed: t.Number(),
  locationId: t.Optional(t.String(),),
  travelPhase: t.Optional(EncounterTravelPhaseSchema,),
},);

/** Body of the outcome POST. */
const OutcomeBody = t.Object({ outcome: t.Record(t.String(), t.Unknown(),), },);

/** Query of the context GET. */
const ContextQuery = t.Object({ templateId: t.String(), locationId: t.Optional(t.String(),), },);

/**
 * Map an engine error onto the shared JSON error envelope.
 * @param error thrown engine error
 * @returns a 400 response naming the failure
 * @throws never
 */
function encounterError(error: unknown,): Response {
  return jsonError({
    message: error instanceof Error ? error.message : String(error,),
    status: HttpStatus.BadRequest,
  },);
}

/**
 * Generic random-encounter routes (059).
 * @param opts shared route options (database, config)
 * @param prefix route prefix, `/api` by default
 * @returns the Elysia plugin exposing the encounter endpoints
 */
export function encounterRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-encounters", },)
    .get(
      `${prefix}/worlds/:worldId/encounter-templates`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const templates = await database
          .selectFrom("encounter_templates",)
          .selectAll()
          .where((eb,) => eb.or([eb("world_id", "is", null,), eb("world_id", "=", ctx.params.worldId,),],))
          .orderBy("id", "asc",)
          .execute();

        return jsonResponse({ data: templates, },);
      },
      {
        response: { 200: t.Object({ data: t.Array(t.Any(),), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "List encounter templates",
          description: "This world's templates plus the global (world-less) ones it may roll.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/encounter-templates`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const body = ctx.body;
        const row = await database
          .insertInto("encounter_templates",)
          .values({
            world_id: ctx.params.worldId,
            name: body.name,
            type: body.type ?? "event",
            trigger_type: body.triggerType ?? "random",
            trigger_chance: body.triggerChance ?? 0,
            cooldown_seconds: body.cooldownSeconds ?? 0,
            difficulty: body.difficulty ?? 0,
            requirements: safeJsonStringify(body.requirements ?? {},),
            rewards: safeJsonStringify(body.rewards ?? {},),
            consequences: safeJsonStringify(body.consequences ?? {},),
            story_notes: body.storyNotes ?? null,
            assistant_driven: body.assistantDriven ?? "automatic",
            travel_phase: body.travelPhase ?? null,
            active: body.active ?? "enabled",
          },)
          .returningAll()
          .executeTakeFirstOrThrow();

        return jsonCreated({ data: row, },);
      },
      {
        body: CreateTemplateBody,
        response: { 201: t.Object({ data: t.Any(), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Create an encounter template",
          description: "Add a world-scoped template to this world's roll pool.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/encounters/roll`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        try {
          const result = await rollEncounter({
            db: database,
            input: {
              worldId: ctx.params.worldId,
              triggerType: ctx.body.triggerType,
              travelPhase: ctx.body.travelPhase,
              rngSeed: ctx.body.rngSeed,
              locationId: ctx.body.locationId,
              now: new Date(),
            },
          },);

          return jsonResponse({ data: result, },);
        } catch (error) {
          if (error instanceof EncounterError) { return encounterError(error,); }
          throw error;
        }
      },
      {
        body: RollBody,
        response: { 200: t.Object({ data: t.Any(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Roll for a random encounter",
          description: "Seeded, cooldown-aware draw from this world's template pool. Same seed, same pick.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/encounters/:rollId/outcome`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        try {
          return jsonResponse({
            data: await recordEncounterOutcome({
              db: database,
              worldId: ctx.params.worldId,
              rollId: ctx.params.rollId,
              outcome: ctx.body.outcome,
            },),
          },);
        } catch (error) {
          if (error instanceof EncounterError) { return encounterError(error,); }
          throw error;
        }
      },
      {
        body: OutcomeBody,
        response: { 200: t.Object({ data: t.Any(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Record an encounter outcome",
          description: "Attach the resolved result to a recorded roll.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/encounters/context`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        // Visibility rule must match the pool and the templates GET: this
        // world's templates plus the global ones. A bare id lookup would
        // hand back another world's story notes to any member.
        const template = await database
          .selectFrom("encounter_templates",)
          .selectAll()
          .where("id", "=", ctx.query.templateId,)
          .where((eb,) => eb.or([eb("world_id", "is", null,), eb("world_id", "=", ctx.params.worldId,),],))
          .executeTakeFirst();

        if (template === undefined) {
          return jsonError({ message: "encounter template not found", status: HttpStatus.NotFound, },);
        }

        return jsonResponse({
          data: await buildEncounterContext({ db: database, worldId: ctx.params.worldId, template, },),
        },);
      },
      {
        query: ContextQuery,
        response: { 200: t.Object({ data: t.Any(), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Build encounter context",
          description: "Story notes, rewards and recent world events for one template, ready for the GM.",
          tags: ["Worlds",],
        },
      },
    );
}
