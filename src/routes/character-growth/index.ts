// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth & Arc Progression Routes
 *
 * CRUD on arc stage + growth log + confirm/reject for LLM-assist
 * proposals. See `.plan/epics/epic-character-growth.md`.
 *
 * Role gating (per epic-character-spec.md review workflow):
 * - GET (player): read arc + applied growth entries
 * - PATCH (author/owner/GM): set arc stage
 * - POST confirm/reject (author/owner/GM): resolve pending entries
 *
 * TypeBox schemas + error mapping + param/query type guards live in
 * `./helpers.ts` to keep this file under the 250-line size-strict
 * ceiling.
 */
import { Elysia, t, } from "elysia";
import { characterGrowthService, } from "../../characters/services/growth-service";
import type {
  ArcStage as ArcStageT,
  GrowthAxis as GrowthAxisT,
  GrowthEntryStatus as GrowthEntryStatusT,
} from "../../characters/spec/growth";
import { type HandlerOpts, requireActorAccess, } from "../actor-auth";
import { jsonError, jsonResponse, } from "../http-utils";
import { errResponse, getBoolean, getNumber, getString, listLogQuery, upsertArcBody, } from "./helpers";

const R = "/api/character-growth";

/** Mount all character-growth routes on the supplied Elysia instance. */
export function characterGrowthRoutes(opts: HandlerOpts,) {
  const svc = () => characterGrowthService(opts.database,);

  return new Elysia({ name: "character-growth", },)
    // ── Get arc + growth state ──────────────────────────────
    .get(`${R}/arc`, async (ctx,) => {
      const actorId = getString(ctx.query, "actorId",);
      if (!actorId) { return jsonError("actorId is required", 400,); }
      const access = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (access instanceof Response) { return access; }
      try {
        // Sequential awaits: eslint bans Promise.all (unhandled-rejection risk).
        const arc = await svc().getArc(actorId,);
        const mode = await svc().getGrowthMode(actorId,);
        return jsonResponse({
          arc,
          growthMode: mode.growthMode,
          llmAssistEnabled: mode.llmAssistEnabled,
        },);
      } catch (error) {
        return errResponse(error,);
      }
    }, {
      query: t.Object({ actorId: t.String(), },),
      detail: {
        summary: "Get character arc + growth mode",
        description: "Read the current arc stage and growth-mode toggle for an actor.",
        tags: ["Character Growth",],
      },
    },)
    // ── Set arc stage (author/owner/GM via requireActorAccess) ────
    .patch(`${R}/arc`, async (ctx,) => {
      const actorId = getString(ctx.params, "actorId",);
      if (!actorId) { return jsonError("actorId is required", 400,); }
      const access = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (access instanceof Response) { return access; }
      try {
        const body = ctx.body as { currentStage: ArcStageT; stageDescription?: string };
        const arc = await svc().upsertArc(
          {
            actorId,
            currentStage: body.currentStage,
            stageDescription: body.stageDescription,
          },
          access,
        );
        return jsonResponse(arc,);
      } catch (error) {
        return errResponse(error,);
      }
    }, {
      params: t.Object({ actorId: t.String(), },),
      body: upsertArcBody,
      detail: {
        summary: "Set character arc stage",
        description:
          "Author/owner/GM sets the current arc stage + optional description. Writes an `arc_stage_set` growth_log entry.",
        tags: ["Character Growth",],
      },
    },)
    // ── List growth log ─────────────────────────────────────
    .get(`${R}/growth-log`, async (ctx,) => {
      const actorId = getString(ctx.query, "actorId",);
      if (!actorId) { return jsonError("actorId is required", 400,); }
      const access = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (access instanceof Response) { return access; }
      try {
        // Default: applied entries only. Author/GM/owner may opt in
        // to pending entries via `?includePending=true`.
        const includePending = getBoolean(ctx.query, "includePending",) ?? false;
        const axis = getString(ctx.query, "axis",) as GrowthAxisT | undefined;
        const status = getString(ctx.query, "status",) as GrowthEntryStatusT | undefined;
        const limit = getNumber(ctx.query, "limit",);
        const entries = await svc().listGrowthLog(actorId, {
          ...(axis ? { axis, } : {}),
          ...(status ? { status, } : {}),
          ...(limit !== undefined ? { limit, } : {}),
          includePending,
        },);
        return jsonResponse({ entries, },);
      } catch (error) {
        return errResponse(error,);
      }
    }, {
      query: listLogQuery,
      detail: {
        summary: "List growth log entries",
        description:
          "Paginated read of growth_log entries. Default: applied entries only. Author/GM/owner may pass `includePending=true`.",
        tags: ["Character Growth",],
      },
    },)
    // ── Confirm pending entry ───────────────────────────────
    .post(`${R}/growth-log/:entryId/confirm`, async (ctx,) => {
      const actorId = getString(ctx.params, "actorId",);
      const entryId = getString(ctx.params, "entryId",);
      if (!actorId || !entryId) { return jsonError("actorId and entryId are required", 400,); }
      const access = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (access instanceof Response) { return access; }
      try {
        const entry = await svc().confirmGrowthEntry({
          actorId,
          entryId,
          confirmedBy: access,
        },);
        return jsonResponse(entry,);
      } catch (error) {
        return errResponse(error,);
      }
    }, {
      params: t.Object({ actorId: t.String(), entryId: t.String(), },),
      detail: {
        summary: "Confirm a pending growth_log entry",
        description: "Author/owner/GM applies a pending LLM-assist proposal.",
        tags: ["Character Growth",],
      },
    },)
    // ── Reject pending entry ────────────────────────────────
    .post(`${R}/growth-log/:entryId/reject`, async (ctx,) => {
      const actorId = getString(ctx.params, "actorId",);
      const entryId = getString(ctx.params, "entryId",);
      if (!actorId || !entryId) { return jsonError("actorId and entryId are required", 400,); }
      const access = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (access instanceof Response) { return access; }
      try {
        const entry = await svc().rejectGrowthEntry({
          actorId,
          entryId,
          rejectedBy: access,
        },);
        return jsonResponse(entry,);
      } catch (error) {
        return errResponse(error,);
      }
    }, {
      params: t.Object({ actorId: t.String(), entryId: t.String(), },),
      detail: {
        summary: "Reject a pending growth_log entry",
        description: "Author/owner/GM rejects a pending LLM-assist proposal.",
        tags: ["Character Growth",],
      },
    },);
}
